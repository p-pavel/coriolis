import { initPage, slider, select, button, kvTable, fitCanvas, num, fixed, force, mass, len, period } from '../ui/common.js';
import { drawShip, makeStars, drawStars, arrow } from '../ui/draw.js';
import { TimePlot } from '../ui/plot.js';
import { STARSHIP, G0 } from '../physics/constants.js';
import { TETHER_MATERIALS } from '../physics/materials.js';
import { designTether } from '../physics/sizing.js';
import { TetherSim, simConfigFromDesign } from '../physics/sim.js';

initPage('tether');

const ISP = 350; // с, для оценки топлива на раскрутку
const P = { ...STARSHIP, gDeck: 1, rpm: 4, matKey: 'dyneema', SF: 3, eta: 0.5 };
loadHash();

let design = null;
let sim = null;
let running = true;
let autoSpin = false;
let thrustDir = 0;
const S = { view: 'inertial', exag: 1, warp: 1, reel: 0, hold: false, thrustKN: 50 };

// --- параметры ---------------------------------------------------------------
const ctl = document.getElementById('controls');
const onDesign = () => {
  recompute();
  resetSim();
  saveHash();
};
slider(ctl, {
  label: 'Тяжесть на полу палубы',
  min: 0.1,
  max: 1.5,
  step: 0.01,
  value: P.gDeck,
  fmt: (v) => `${fixed(v, 2)} g`,
  hint: 'Марс — 0,38 g, Луна — 0,17 g',
  onInput: (v) => ((P.gDeck = v), onDesign()),
});
slider(ctl, {
  label: 'Скорость вращения',
  min: 0.5,
  max: 10,
  step: 0.1,
  value: P.rpm,
  fmt: (v) => `${fixed(v, 1)} об/мин`,
  hint: 'чем медленнее, тем длиннее трос и комфортнее экипажу',
  onInput: (v) => ((P.rpm = v), onDesign()),
});
slider(ctl, {
  label: 'Масса каждого корабля',
  min: 50e3,
  max: 300e3,
  step: 5e3,
  value: P.M,
  fmt: (v) => mass(v),
  onInput: (v) => ((P.M = v), onDesign()),
});
select(ctl, {
  label: 'Материал троса',
  options: Object.entries(TETHER_MATERIALS).map(([k, m]) => ({ value: k, text: m.name })),
  value: P.matKey,
  onChange: (v) => ((P.matKey = v), onDesign()),
});
slider(ctl, {
  label: 'Запас прочности n',
  min: 1.5,
  max: 5,
  step: 0.1,
  value: P.SF,
  fmt: (v) => fixed(v, 1),
  hint: 'во сколько раз разрушающая нагрузка больше рабочей',
  onInput: (v) => ((P.SF = v), onDesign()),
});
slider(ctl, {
  label: 'Реализация прочности в канате η',
  min: 0.3,
  max: 1,
  step: 0.05,
  value: P.eta,
  fmt: (v) => fixed(v, 2),
  hint: 'канат слабее волокна: плетение, заделки концов',
  onInput: (v) => ((P.eta = v), onDesign()),
});
const geo = document.createElement('details');
geo.innerHTML = '<summary>Геометрия корабля (оценки)</summary>';
ctl.append(geo);
slider(geo, { label: 'Длина корабля', min: 30, max: 70, step: 1, value: P.length, fmt: (v) => `${v} м`, onInput: (v) => ((P.length = v), onDesign()) });
slider(geo, {
  label: 'Нос → центр масс',
  min: 10,
  max: 50,
  step: 1,
  value: P.cmFromNose,
  fmt: (v) => `${v} м`,
  hint: 'у пустого корабля ЦМ ближе к двигателям',
  onInput: (v) => ((P.cmFromNose = v), onDesign()),
});
slider(geo, {
  label: 'Нос → пол жилой палубы',
  min: 2,
  max: 45,
  step: 1,
  value: P.deckFromNose,
  fmt: (v) => `${v} м`,
  onInput: (v) => ((P.deckFromNose = v), onDesign()),
});
slider(geo, {
  label: 'Радиус инерции корабля',
  min: 5,
  max: 25,
  step: 0.5,
  value: P.gyration,
  fmt: (v) => `${fixed(v, 1)} м`,
  hint: 'I = M·k²; для однородного стержня k = L/√12 ≈ 0,29·L',
  onInput: (v) => ((P.gyration = v), onDesign()),
});

// --- расчёт ------------------------------------------------------------------
function recompute() {
  const mat = TETHER_MATERIALS[P.matKey];
  design = designTether({ ...P, mat, halfWidth: P.diameter / 2 });
  const d = design;
  const v = document.getElementById('verdict');
  if (!d.ok) {
    v.innerHTML = `<div class="verdict bad">${d.reason}</div>`;
    kvTable(document.getElementById('tableA'), [['Радиус пола палубы', len(d.rDeck)]]);
    document.getElementById('tableB').innerHTML = '';
    return;
  }
  const cls = ['', '', 'warn', 'bad'][d.comfort.level];
  v.innerHTML = `<div class="verdict ${cls}">Пол палубы на радиусе <b>${len(d.rDeck)}</b>, трос между носами <b>${len(2 * d.Ra)}</b>.
    ${fixed(P.rpm, 1)} об/мин — ${d.comfort.text}.
    Трос ${mat.name.split(' ')[0]} Ø <b>${len(d.diameter, 2)}</b> весит <b>${mass(d.mTether, 2)}</b> —
    ${num(d.tetherFraction * 100, 2)} % массы кораблей.</div>`;

  const spinDv = d.w * d.Rcm * (1 + (P.gyration * P.gyration) / (d.Rcm * d.Rcm));
  const prop = P.M * (1 - Math.exp(-spinDv / (ISP * G0)));
  kvTable(document.getElementById('tableA'), [
    '#Вращение',
    ['Скорость вращения', `${fixed(P.rpm, 1)} об/мин · ${num(d.w, 3)} рад/с`],
    ['Период оборота', period(60 / P.rpm)],
    ['Радиус пола палубы', len(d.rDeck)],
    ['Радиус носа (полудлина троса)', len(d.Ra)],
    ['Полный размах системы', len(2 * (d.Ra + P.length))],
    ['Скорость центра масс корабля', `${num(d.vRim)} м/с`],
    '#Ощущения экипажа',
    ['Зона комфорта', d.comfort.text],
    ['Кориолис при ходьбе 1 м/с', `${num(d.coriolisWalk * 100, 2)} % веса`],
    ['Тяжесть: ноги vs голова (рост 1,8 м)', `−${num(d.gradient * 100, 2)} %`],
    ['Наклон вертикали у стены (пол плоский)', `${num((d.tiltEdge * 180) / Math.PI, 2)}°`],
    '#Раскрутка и авария',
    ['Δv на раскрутку каждому кораблю', `${num(spinDv)} м/с`],
    [`Топливо на раскрутку (Isp ${ISP} с)`, `${mass(prop, 2)} на корабль`],
    ['Скорость разлёта при обрыве', `${num(d.releaseSpeed)} м/с`],
  ]);
  kvTable(document.getElementById('tableB'), [
    '#Трос',
    ['Материал', mat.name],
    ['Нагрузка от корабля', `${force(d.Ta)} (≈ ${num(d.Ta / G0 / 1000)} тс)`],
    ['Натяжение на оси', force(d.T0, 4)],
    ['Допускаемое напряжение ησ/n', `${num(d.sAllow / 1e6)} МПа`],
    ['Разрывная нагрузка каната', force(d.Tbreak)],
    ['Сечение / диаметр', `${num(d.A * 1e4)} см² · Ø ${len(d.diameter, 2)}`],
    ['Масса троса', `${mass(d.mTether)} (${num(d.tetherFraction * 100, 2)} % кораблей)`],
    ['Удлинение под нагрузкой', `${len(2 * d.stretchHalf)} (${num(d.strainMax * 100, 2)} %)`],
    ['Предельная скорость для материала', `${num(Math.sqrt((2 * d.sAllow) / mat.rho))} м/с`],
    '#Собственные колебания',
    ['Продольные («подпрыгивание»)', period((2 * Math.PI) / d.wBounce)],
    ['Поперечная волна: скорость', `${num(d.waveSpeed)} м/с`],
    ['Поперечная волна: 1-я мода', period((2 * Math.PI) / d.wString)],
    ['Качание кораблей в одну сторону', period((2 * Math.PI) / d.pitch.sym)],
    ['Качание кораблей навстречу', period((2 * Math.PI) / d.pitch.anti)],
    ['Для сравнения: период вращения', period(60 / P.rpm)],
    ['Примечание', `<span class="muted small">${mat.note}</span>`],
  ]);
}

// --- симуляция ---------------------------------------------------------------
const view = document.getElementById('view');
const stars = makeStars();
const plot = new TimePlot(
  document.getElementById('plot'),
  [
    { name: 'Тяжесть на палубе', color: '#ffb86b', fmt: (x) => `${fixed(x, 4)} g` },
    { name: 'Натяжение у корабля', color: '#7fd1ff', fmt: (x) => `${fixed(x, 3)} МН` },
    { name: 'Вращение', color: '#7ee08a', fmt: (x) => `${fixed(x, 3)} об/мин` },
    { name: 'Качание корабля', color: '#c792ea', fmt: (x) => `${fixed(x, 2)}°` },
    { name: 'Длина троса (без нагрузки)', color: '#9aa5b8', fmt: (x) => `${fixed(x, 2)} м` },
  ],
  40,
);

function resetSim(mode = 'steady') {
  autoSpin = false;
  plot.clear();
  if (!design || !design.ok) {
    sim = null;
    return;
  }
  const cfg = simConfigFromDesign(design, P, 24);
  if (mode === 'zero') cfg.omega = 0;
  sim = new TetherSim(cfg);
  sim.ctrl.Tref = design.Ta;
  applyCtl();
}

function applyCtl() {
  if (!sim) return;
  sim.ctrl.mode = S.hold ? 'hold' : 'manual';
  sim.ctrl.reelRate = S.reel;
  sim.ctrl.tau = 1.5;
}

const scen = document.getElementById('scenarios');
button(scen, '↺ Сброс', () => resetSim());
const pauseBtn = button(scen, '⏸ Пауза', () => {
  running = !running;
  pauseBtn.textContent = running ? '⏸ Пауза' : '▶ Пуск';
});
button(scen, 'Толчок вдоль троса', () => sim && sim.kickRadial(0.5));
button(scen, 'Качнуть в одну сторону', () => sim && sim.kickPitch(0.05, true));
button(scen, 'Качнуть навстречу', () => sim && sim.kickPitch(0.05, false));
button(scen, 'Щипок троса', () => sim && sim.pluck(3));
// размах колебаний / статическое растяжение: >1 — провис, пик натяжения ≈ (1 + отношение)·Ta
const kickForAmp = (f) => f * 2 * design.stretchHalf * design.wBounce;
button(scen, 'Сильный толчок (провис)', () => sim && sim.kickRadial(kickForAmp(1.5)));
button(scen, 'Очень сильный толчок', () => sim && sim.kickRadial(kickForAmp(2.6)));
button(scen, 'Обрыв троса', () => sim && sim.cut());
button(scen, 'Раскрутка с нуля', () => {
  resetSim('zero');
  autoSpin = true;
});

const sc = document.getElementById('simctl');
const colA = document.createElement('div');
const colB = document.createElement('div');
sc.append(colA, colB);
select(colA, {
  label: 'Вид',
  options: [
    { value: 'inertial', text: 'со стороны (инерциальная СО)' },
    { value: 'rotating', text: 'вместе с тросом (вращающаяся СО)' },
  ],
  value: S.view,
  onChange: (v) => (S.view = v),
});
slider(colA, {
  label: 'Увеличение отклонений (во вращ. СО)',
  min: 1,
  max: 300,
  step: 1,
  value: S.exag,
  scale: 'log',
  fmt: (v) => `×${num(v, 3)}`,
  hint: 'поперечные смещения и углы качания — сантиметры и доли градуса',
  onInput: (v) => (S.exag = v),
});
slider(colA, { label: 'Ускорение времени', min: 0.1, max: 20, step: 0.1, value: S.warp, scale: 'log', fmt: (v) => `×${num(v, 2)}`, onInput: (v) => (S.warp = v) });
const reelS = slider(colB, {
  label: 'Лебёдка (+ выпуск, − подтягивание)',
  min: -3,
  max: 3,
  step: 0.1,
  value: 0,
  fmt: (v) => `${fixed(v, 1)} м/с`,
  onInput: (v) => ((S.reel = v), applyCtl()),
});
const wb = document.createElement('div');
wb.className = 'btns';
colB.append(wb);
button(wb, 'Стоп лебёдки', () => {
  S.reel = 0;
  reelS.value = 0;
  applyCtl();
});
const holdBtn = button(wb, 'Лебёдка держит тяжесть', () => {
  S.hold = !S.hold;
  holdBtn.classList.toggle('on', S.hold);
  applyCtl();
});
slider(colB, {
  label: 'Тяга двигателей поперёк оси',
  min: 5,
  max: 300,
  step: 5,
  value: S.thrustKN,
  fmt: (v) => `${v} кН`,
  hint: 'на каждый корабль; удерживайте кнопку',
  onInput: (v) => (S.thrustKN = v),
});
const tb = document.createElement('div');
tb.className = 'btns';
colB.append(tb);
for (const [txt, dir] of [
  ['⟲ Разгон', 1],
  ['Торможение', -1],
]) {
  const b = button(tb, txt, () => {});
  const on = () => {
    thrustDir = dir;
    b.classList.add('on');
  };
  const off = () => {
    thrustDir = 0;
    b.classList.remove('on');
  };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
}

function draw() {
  const { ctx, w, h } = fitCanvas(view, 16 / 9);
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, w, h);
  drawStars(ctx, stars, w, h);
  if (!sim) {
    ctx.fillStyle = '#ff7272';
    ctx.font = '16px system-ui';
    ctx.fillText('Нет решения при этих параметрах', 20, 30);
    return;
  }
  const N = sim.N;
  const [A, B] = sim.ships;
  const cmx = 0.5 * (A.x + B.x);
  const cmy = 0.5 * (A.y + B.y);
  const rot = S.view === 'rotating';
  const f = rot ? S.exag : 1;
  const phi = Math.atan2(B.y - A.y, B.x - A.x);
  const span = 0.5 * sim.shipDistance() + P.length * 0.45 + 8;
  const k = rot ? Math.min((w * 0.47) / span, (h * 0.9) / (P.length * 0.6 + 20)) : (Math.min(w, h) * 0.47) / span;
  const cphi = Math.cos(phi);
  const sphi = Math.sin(phi);
  const T = (x, y) => {
    const dx = x - cmx;
    const dy = y - cmy;
    if (!rot) return [w / 2 + k * dx, h / 2 - k * dy];
    const al = dx * cphi + dy * sphi;
    const la = (-dx * sphi + dy * cphi) * f;
    return [w / 2 + k * al, h / 2 - k * la];
  };
  const toLocal = (x, y) => {
    const [sx, sy] = T(x, y);
    return [sx, sy];
  };

  if (!rot) {
    ctx.strokeStyle = 'rgba(127,209,255,0.12)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, k * (sim.noseRadius() + sim.as), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, h / 2);
  ctx.lineTo(w / 2 + 6, h / 2);
  ctx.moveTo(w / 2, h / 2 - 6);
  ctx.lineTo(w / 2, h / 2 + 6);
  ctx.stroke();

  // трос
  ctx.lineWidth = 2;
  for (let j = 0; j < N; j++) {
    if (sim.broken[j]) continue;
    const [x0, y0] = toLocal(sim.x[j], sim.y[j]);
    const [x1, y1] = toLocal(sim.x[j + 1], sim.y[j + 1]);
    ctx.strokeStyle = sim.T[j] > 0 ? '#7fd1ff' : '#ff7272';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // корабли
  const id = (x, y) => toLocal(x, y);
  for (let i = 0; i < 2; i++) {
    const sh = sim.ships[i];
    const nk = i === 0 ? 0 : N;
    let ang = sh.th;
    if (rot) {
      const ref = i === 0 ? 0 : Math.PI;
      let dv = sh.th - phi - ref;
      dv = Math.atan2(Math.sin(dv), Math.cos(dv));
      ang = ref + f * dv;
    }
    const [nx, ny] = id(sim.x[nk], sim.y[nk]);
    const flame = thrustDir !== 0 || autoSpin ? -(thrustDir || 1) : 0;
    drawShip(ctx, (x, y) => [x, y], k, nx, ny, ang, P.length, P.diameter, { deckFromNose: P.deckFromNose, thrusterSide: flame });
    // ощущаемая вертикаль на палубе
    const g = sim.deckGravity(i);
    const ex = Math.cos(ang);
    const ey = Math.sin(ang);
    const dx = nx - ex * P.deckFromNose * k;
    const dy = ny + ey * P.deckFromNose * k;
    const tilt = rot ? g.tilt * f : g.tilt;
    const ga = Math.atan2(-ey, -ex) + tilt;
    const Lg = Math.min(60, 28 * (g.g / G0));
    arrow(ctx, dx, dy, dx + Math.cos(ga) * Lg, dy - Math.sin(ga) * Lg, '#ffb86b', 2, 7);
  }

  // табло
  const gd = sim.deckGravity(1);
  const winchP = 0.5 * (sim.T[0] + sim.T[N - 1]) * -sim.u;
  const slack = sim.slackCount();
  const lines = [
    `t = ${fixed(sim.t, 1)} с`,
    `вращение: ${fixed((sim.spinRate() * 60) / (2 * Math.PI), 3)} об/мин`,
    `тяжесть на палубе: ${fixed(gd.g / G0, 3)} g, наклон ${fixed((gd.tilt * 180) / Math.PI, 2)}°`,
    `натяжение у корабля: ${force(sim.T[N - 1])}`,
    `трос: ${fixed(sim.restLength(), 2)} м, лебёдка ${fixed(sim.u, 2)} м/с, ${num(winchP / 1e6, 2)} МВт`,
  ];
  let maxT = 0;
  for (let j = 0; j < N; j++) maxT = Math.max(maxT, sim.T[j]);
  if (sim.snapped) lines.push(`ТРОС ПОРВАЛСЯ: ${force(sim.snapped.T)} > разрывной ${force(sim.cfg.Tbreak)}`);
  else if (sim.broken.some((b) => b)) lines.push('ТРОС ОБОРВАН');
  else if (slack) lines.push(`провисло отрезков: ${slack} из ${N}`);
  else lines.push(`запас до разрыва: ×${fixed(sim.cfg.Tbreak / maxT, 2)}`);
  if (autoSpin) lines.push('раскрутка двигателями…');
  if (rot && f > 1) lines.push(`поперечные смещения и углы увеличены ×${num(f, 3)}`);
  ctx.font = '13px ui-monospace, monospace';
  lines.forEach((s, i) => {
    ctx.fillStyle = s.startsWith('ТРОС') || s.startsWith('провис') ? '#ff7272' : '#c9d2e3';
    ctx.fillText(s, 12, 20 + i * 17);
  });
}

let last = performance.now();
function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (sim && running) {
    if (autoSpin) {
      if (sim.spinRate() < design.w) sim.ctrl.thrust = S.thrustKN * 1e3;
      else {
        autoSpin = false;
        sim.ctrl.thrust = 0;
      }
    } else sim.ctrl.thrust = thrustDir * S.thrustKN * 1e3;
    sim.advance(S.warp * dtReal);
    const N = sim.N;
    plot.push(sim.t, [sim.deckGravity(1).g / G0, sim.T[N - 1] / 1e6, (sim.spinRate() * 60) / (2 * Math.PI), (sim.pitchAngle(1) * 180) / Math.PI, sim.restLength()]);
  }
  draw();
  plot.draw();
  requestAnimationFrame(frame);
}

// --- состояние в адресной строке ---------------------------------------------
function saveHash() {
  const q = new URLSearchParams();
  for (const k of ['gDeck', 'rpm', 'M', 'matKey', 'SF', 'eta', 'length', 'cmFromNose', 'deckFromNose', 'gyration']) q.set(k, P[k]);
  history.replaceState(null, '', '#' + q.toString());
}
function loadHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of q) {
    if (!(k in P)) continue;
    P[k] = k === 'matKey' ? (v in TETHER_MATERIALS ? v : P[k]) : Number(v);
  }
}

recompute();
resetSim();
requestAnimationFrame(frame);
