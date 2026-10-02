import { initPage, slider, button, kvTable, fitCanvas, num, fixed, len, mass, force, period } from '../ui/common.js';
import { drawShip, arrow, makeStars, drawStars } from '../ui/draw.js';
import { STARSHIP, G0 } from '../physics/constants.js';
import { TETHER_MATERIALS } from '../physics/materials.js';
import { designTether } from '../physics/sizing.js';
import { crossing } from '../physics/climb.js';

initPage('climb');

const P = { gDeck: 1, rpm: 4, m: 100, vmax: 0.5, amax: 0.2, slow: 10 };
let d = null;
let cr = null;
let tAnim = 0;
let running = true;

const ctl = document.getElementById('controls');
const ui = {};
const re = () => update();
ui.gDeck = slider(ctl, { label: 'Тяжесть на палубе', min: 0.1, max: 1.5, step: 0.01, value: P.gDeck, fmt: (v) => `${fixed(v, 2)} g`, onInput: (v) => ((P.gDeck = v), re()) });
ui.rpm = slider(ctl, { label: 'Скорость вращения', min: 0.5, max: 10, step: 0.1, value: P.rpm, fmt: (v) => `${fixed(v, 1)} об/мин`, onInput: (v) => ((P.rpm = v), re()) });
ui.m = slider(ctl, {
  label: 'Масса (человек или кабина)',
  min: 50,
  max: 5000,
  step: 10,
  value: P.m,
  scale: 'log',
  fmt: (v) => mass(v),
  onInput: (v) => ((P.m = v), re()),
});
ui.vmax = slider(ctl, {
  label: 'Скорость движения',
  min: 0.1,
  max: 5,
  step: 0.05,
  value: P.vmax,
  fmt: (v) => `${fixed(v, 2)} м/с`,
  hint: 'перехват руками ~0,3–0,5 м/с, кабина — до нескольких м/с',
  onInput: (v) => ((P.vmax = v), re()),
});
ui.amax = slider(ctl, { label: 'Разгон / торможение', min: 0.05, max: 2, step: 0.05, value: P.amax, fmt: (v) => `${fixed(v, 2)} м/с²`, onInput: (v) => ((P.amax = v), re()) });
slider(ctl, { label: 'Ускорение показа', min: 1, max: 100, step: 1, value: P.slow, scale: 'log', fmt: (v) => `×${num(v, 2)}`, onInput: (v) => (P.slow = v) });
const bt = document.getElementById('btns');
button(bt, 'Человек, 0,5 м/с', () => setP({ m: 100, vmax: 0.5, amax: 0.2 }));
button(bt, 'Человек торопится, 2 м/с', () => setP({ m: 100, vmax: 2, amax: 0.5 }));
button(bt, 'Кабина-лифт 3 т, 3 м/с', () => setP({ m: 3000, vmax: 3, amax: 0.5 }));
button(bt, '↺ С начала', () => (tAnim = 0));
const pb = button(bt, '⏸', () => {
  running = !running;
  pb.textContent = running ? '⏸' : '▶';
});

function setP(o) {
  Object.assign(P, o);
  for (const k of Object.keys(o)) if (ui[k]) ui[k].value = P[k];
  update();
}

function update() {
  d = designTether({ ...STARSHIP, gDeck: P.gDeck, rpm: P.rpm, mat: TETHER_MATERIALS.dyneema, SF: 3, eta: 0.5 });
  tAnim = 0;
  if (!d.ok) {
    cr = null;
    document.getElementById('result').innerHTML = `<div class="verdict bad">${d.reason}</div>`;
    return;
  }
  const I = d.I;
  const Isys = 2 * (STARSHIP.M * d.Rcm * d.Rcm + I) + (d.mTether * d.Ra * d.Ra) / 3;
  cr = crossing({ R: d.Ra, w: d.w, m: P.m, vmax: P.vmax, amax: P.amax, Isys, Ttether: d.Ta });
  const maxAcross = Math.max(...cr.rows.map((r) => Math.abs(r.across)));
  const maxSag = Math.max(...cr.rows.map((r) => r.sag));
  const hEq = (d.w * d.w * d.Ra * d.Ra) / (2 * G0);
  const rStar = (2 * cr.prof.vPeak) / d.w;
  kvTable(document.getElementById('result'), [
    '#Путь',
    ['Длина троса (нос — нос)', len(2 * d.Ra)],
    ['Время перехода', period(cr.prof.T)],
    ['Вес у носа корабля', `${fixed((d.w * d.w * d.Ra) / G0, 3)} g (${force(P.m * d.w * d.w * d.Ra)})`],
    '#Энергия',
    ['Работа подъёма до оси', `${num(cr.work / 1000)} кДж`],
    ['Это как подняться на Земле на', len(hEq)],
    ['На спуске нужно погасить', `${num(cr.work / 1000)} кДж`],
    '#Кориолис',
    ['Наибольшая боковая сила', `${force(maxAcross)} (${fixed((maxAcross / (P.m * G0)) * 100, 1)} % земного веса)`],
    ['Радиус, ниже которого Кориолис больше веса', len(rStar)],
    ['Прогиб троса под боковой силой', len(maxSag)],
    '#Система',
    ['Вращение, пока груз у оси', `+${num(((cr.wCenter - d.w) / d.w) * 100, 2)} %`],
  ]);
}

const view = document.getElementById('view');
const stars = makeStars(140, 3);

function stateAt(t) {
  const rows = cr.rows;
  const i = Math.min(rows.length - 1, Math.max(0, Math.round((t / cr.prof.T) * (rows.length - 1))));
  return rows[i];
}

function draw() {
  const { ctx, w, h } = fitCanvas(view, 2.4);
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, w, h);
  drawStars(ctx, stars, w, h);
  if (!cr) return;
  const Ra = d.Ra;
  const k = (w * 0.47) / (Ra + 18);
  const S = (x, y) => [w / 2 + k * x, h / 2 - k * y];
  // концы кораблей
  drawShip(ctx, S, k, Ra, 0, Math.PI, STARSHIP.length, STARSHIP.diameter);
  drawShip(ctx, S, k, -Ra, 0, 0, STARSHIP.length, STARSHIP.diameter);
  const st = stateAt(tAnim);
  // ощущаемый вес = −F/m: вдоль (ω²x − ẍ), поперёк −2ωẋ; трос прогибается туда же
  const gx = -st.along / P.m;
  const gy = -st.across / P.m;
  const sagVis = Math.sign(gy) * Math.min(st.sag * 50, 25 / k);
  ctx.strokeStyle = '#7fd1ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(...S(Ra, 0));
  ctx.lineTo(...S(st.x, sagVis));
  ctx.lineTo(...S(-Ra, 0));
  ctx.stroke();
  const [cx, cy] = S(st.x, sagVis);
  const sc = 60 / G0;
  arrow(ctx, cx, cy, cx + gx * sc, cy, '#ffb86b', 2.5, 8);
  arrow(ctx, cx, cy, cx, cy - gy * sc * 5, '#c792ea', 2.5, 8);
  ctx.fillStyle = '#e6edf7';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#8e99ad';
  ctx.font = '12px system-ui';
  ctx.fillText('ось', w / 2 - 9, h / 2 + 18);
  ctx.fillText('вращающаяся СО; вращение — против часовой стрелки', 10, 16);
  ctx.fillText(`t = ${fixed(st.t, 1)} с, x = ${fixed(st.x, 1)} м, скорость ${fixed(st.v, 2)} м/с`, 10, h - 10);
  ctx.fillText('Кориолис показан ×5, прогиб троса ×50', w - 250, h - 10);
}

function drawPlot() {
  const c = document.getElementById('plot');
  const { ctx, w, h } = fitCanvas(c);
  ctx.clearRect(0, 0, w, h);
  if (!cr) return;
  const rows = cr.rows;
  const lanes = [
    { name: 'вес вдоль троса, g', color: '#ffb86b', f: (r) => -r.along / (P.m * G0) },
    { name: 'Кориолис, g', color: '#c792ea', f: (r) => -r.across / (P.m * G0) },
    { name: 'наклон вертикали от троса, °', color: '#7ee08a', f: (r) => (Math.atan2(Math.abs(r.across), Math.abs(r.along)) * 180) / Math.PI },
  ];
  const lane = h / lanes.length;
  const Ra = d.Ra;
  const X = (x) => 10 + ((Ra - x) / (2 * Ra)) * (w - 20);
  ctx.font = '12px system-ui';
  lanes.forEach((L, i) => {
    const vals = rows.map(L.f);
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (hi - lo < 1e-9) hi = lo + 1;
    const y0 = i * lane;
    const Y = (v) => y0 + lane - 6 - ((v - lo) / (hi - lo)) * (lane - 24);
    ctx.strokeStyle = '#1d2433';
    ctx.beginPath();
    ctx.moveTo(0, Y(0));
    ctx.lineTo(w, Y(0));
    ctx.stroke();
    ctx.strokeStyle = L.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rows.forEach((r, j) => (j ? ctx.lineTo(X(r.x), Y(vals[j])) : ctx.moveTo(X(r.x), Y(vals[j]))));
    ctx.stroke();
    ctx.fillStyle = L.color;
    ctx.fillText(`${L.name}: ${num(lo, 3)} … ${num(hi, 3)}`, 10, y0 + 14);
  });
  const st = stateAt(tAnim);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(X(st.x), 0);
  ctx.lineTo(X(st.x), h);
  ctx.stroke();
  ctx.fillStyle = '#6f7a8f';
  ctx.fillText('нос корабля A', 10, h - 4);
  ctx.textAlign = 'center';
  ctx.fillText('ось', w / 2, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText('нос корабля B', w - 10, h - 4);
  ctx.textAlign = 'left';
}

let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  if (cr && running) {
    tAnim += dt * P.slow;
    if (tAnim > cr.prof.T + 3 * P.slow) tAnim = 0;
  }
  draw();
  drawPlot();
  requestAnimationFrame(frame);
}

update();
requestAnimationFrame(frame);
