import { initPage, slider, select, kvTable, fitCanvas, num, fixed, len, mass, force, period } from '../ui/common.js';
import { drawShip, makeStars, drawStars } from '../ui/draw.js';
import { LEO_MEAN_MOTION } from '../physics/constants.js';
import { STRUCTURE_MATERIALS } from '../physics/materials.js';
import { designRing, spinAxisPrecession } from '../physics/sizing.js';

initPage('ring');

const P = { gFloor: 1, rpm: 2, tubeRadius: 5, pressure: 70e3, shellKey: 'al2219', bandKey: 'steel304', SF: 3, shieldAreal: 0, interiorLinear: 2000 };
let r = null;

const ctl = document.getElementById('controls');
const re = () => update();
slider(ctl, { label: 'Тяжесть на полу', min: 0.1, max: 1.5, step: 0.01, value: P.gFloor, fmt: (v) => `${fixed(v, 2)} g`, onInput: (v) => ((P.gFloor = v), re()) });
slider(ctl, { label: 'Скорость вращения', min: 0.3, max: 10, step: 0.1, value: P.rpm, fmt: (v) => `${fixed(v, 1)} об/мин`, onInput: (v) => ((P.rpm = v), re()) });
slider(ctl, { label: 'Радиус трубы (сечение отсека)', min: 2, max: 15, step: 0.5, value: P.tubeRadius, fmt: (v) => `${fixed(v, 1)} м`, onInput: (v) => ((P.tubeRadius = v), re()) });
slider(ctl, {
  label: 'Давление воздуха',
  min: 30e3,
  max: 101e3,
  step: 1e3,
  value: P.pressure,
  fmt: (v) => `${num(v / 1000)} кПа`,
  hint: 'МКС — 101 кПа; ~70 кПа с обогащением кислородом',
  onInput: (v) => ((P.pressure = v), re()),
});
const matOpts = Object.entries(STRUCTURE_MATERIALS).map(([k, m]) => ({ value: k, text: m.name }));
select(ctl, { label: 'Материал оболочки', options: matOpts, value: P.shellKey, onChange: (v) => ((P.shellKey = v), re()) });
select(ctl, { label: 'Материал силового пояса', options: matOpts, value: P.bandKey, onChange: (v) => ((P.bandKey = v), re()) });
slider(ctl, { label: 'Запас прочности', min: 1.5, max: 5, step: 0.1, value: P.SF, fmt: (v) => fixed(v, 1), onInput: (v) => ((P.SF = v), re()) });
slider(ctl, {
  label: 'Радиационная защита',
  min: 0,
  max: 10000,
  step: 100,
  value: P.shieldAreal,
  fmt: (v) => `${num(v / 1000, 2)} т/м²`,
  hint: 'защита от галактических лучей уровня Земли — порядка 5–10 т/м²; на НОО частично защищает магнитосфера',
  onInput: (v) => ((P.shieldAreal = v), re()),
});
slider(ctl, {
  label: 'Начинка на метр кольца',
  min: 200,
  max: 10000,
  step: 100,
  value: P.interiorLinear,
  fmt: (v) => `${num(v / 1000, 2)} т/м`,
  hint: 'перекрытия, оборудование, люди, вода',
  onInput: (v) => ((P.interiorLinear = v), re()),
});

function update() {
  r = designRing({ ...P, shellMat: STRUCTURE_MATERIALS[P.shellKey], bandMat: STRUCTURE_MATERIALS[P.bandKey] });
  const vEl = document.getElementById('verdict');
  if (!r.ok) {
    vEl.innerHTML = `<div class="verdict bad">${r.reason}</div>`;
    return;
  }
  const parts = [
    ['гермооболочка', r.massShell],
    ['радиационная защита', r.massShield],
    ['начинка', r.massInterior],
    ['силовой пояс (вращение)', r.massBand],
  ].sort((a, b) => b[1] - a[1]);
  const cls = ['', '', 'warn', 'bad'][r.comfort.level];
  vEl.innerHTML = `<div class="verdict ${cls}">Радиус <b>${len(r.R)}</b>, ${fixed(P.rpm, 1)} об/мин — ${r.comfort.text}.
    Масса <b>${mass(r.mass)}</b> ≈ <b>${num(r.launches, 2)}</b> запусков Starship по 100 т.
    Больше всего весит: ${parts[0][0]} (${num((parts[0][1] / r.mass) * 100, 2)} %).</div>`;
  const wp = spinAxisPrecession({ n: LEO_MEAN_MOTION, w: r.w });
  kvTable(document.getElementById('table'), [
    '#Геометрия и вращение',
    ['Радиус кольца', len(r.R)],
    ['Длина по окружности', len(r.circumference)],
    ['Скорость обода', `${num(r.v)} м/с`],
    ['Площадь пола (оценка)', `${num(r.floorArea / 1e4, 2)} га`],
    ['Кориолис при ходьбе 1 м/с', `${num(r.coriolisWalk * 100, 2)} % веса`],
    ['Тяжесть: ноги vs голова', `−${num(r.gradient * 100, 2)} %`],
    '#Погонные массы',
    ['Гермооболочка (толщина)', `${num(r.lamShell / 1000, 3)} т/м (${len(r.tShell, 2)})`],
    ['Радиационная защита', `${num(r.lamShield / 1000, 3)} т/м`],
    ['Начинка', `${num(r.lamInterior / 1000, 3)} т/м`],
    ['Силовой пояс', `${num(r.lamBand / 1000, 3)} т/м (${num(r.Ab * 1e4, 3)} см²)`],
    ['Натяжение обода', force(r.hoopTension)],
    '#Итог',
    ['Полная масса', mass(r.mass)],
    ['Запусков Starship (100 т)', num(r.launches, 3)],
    ['Предельная скорость обода для пояса', `${num(r.vMax)} м/с`],
    ['…это радиус при той же тяжести', len(r.RmaxAtG)],
    ['Период прецессии оси на НОО (× 1/cos β)', period((2 * Math.PI) / Math.abs(wp))],
  ]);
}

const view = document.getElementById('view');
const stars = makeStars(200, 11);
let ang = 0;
let lastNow = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  const { ctx, w, h } = fitCanvas(view, 16 / 9);
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, w, h);
  drawStars(ctx, stars, w, h);
  if (r && r.ok) {
    ang += r.w * dt;
    const k = (Math.min(w, h) * 0.42) / (r.R + P.tubeRadius);
    const cx = w * 0.45;
    const cy = h / 2;
    // спицы
    ctx.strokeStyle = 'rgba(160,170,190,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = ang + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + k * r.R * Math.cos(a), cy - k * r.R * Math.sin(a));
      ctx.stroke();
    }
    // труба
    ctx.strokeStyle = '#b9c0ca';
    ctx.lineWidth = Math.max(2, 2 * P.tubeRadius * k);
    ctx.beginPath();
    ctx.arc(cx, cy, k * r.R, 0, 2 * Math.PI);
    ctx.stroke();
    // окна — показывают вращение
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 48; i++) {
      const a = ang + (i * 2 * Math.PI) / 48;
      ctx.beginPath();
      ctx.arc(cx + k * r.R * Math.cos(a), cy - k * r.R * Math.sin(a), Math.max(1, 0.4 * P.tubeRadius * k), 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = '#556';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, 6 * k), 0, 2 * Math.PI);
    ctx.fill();
    // Starship для масштаба
    const sx = w * 0.9;
    drawShip(ctx, (x, y) => [x, y], k, sx, h * 0.3, Math.PI / 2, 50, 9);
    ctx.fillStyle = '#8e99ad';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Starship', sx, h * 0.3 - 8);
    ctx.textAlign = 'left';
    ctx.fillText(`R = ${len(r.R)}, ${fixed(P.rpm, 1)} об/мин (показ в реальном времени)`, 10, 18);
  }
  requestAnimationFrame(frame);
}

update();
requestAnimationFrame(frame);
