import { initPage, slider, select, button, kvTable, fitCanvas, num, fixed, len } from '../ui/common.js';
import { drawApple, arrow } from '../ui/draw.js';
import { G0, rpmToOmega } from '../physics/constants.js';
import { dropTrajectory, stateAt } from '../physics/drop.js';

initPage('apple');

const HALF = 4.5; // полуширина палубы Starship, м
const P = { geometry: 'flat', g: 1, rpm: 4, h: 1.5, vFwd: 0, vUp: 0, slow: 1 };
let tr = null;
let geo = null;
let tAnim = 0;
let hold = 0;

const ctl = document.getElementById('controls');
const ui = {};
ui.geometry = select(ctl, {
  label: 'Где падает',
  options: [
    { value: 'flat', text: 'плоская палуба корабля на тросе (ширина 9 м)' },
    { value: 'ring', text: 'кольцевая станция (пол — дуга)' },
  ],
  value: P.geometry,
  onChange: (v) => ((P.geometry = v), update()),
});
ui.g = slider(ctl, { label: 'Тяжесть на полу', min: 0.1, max: 1.5, step: 0.01, value: P.g, fmt: (v) => `${fixed(v, 2)} g`, onInput: (v) => ((P.g = v), update()) });
ui.rpm = slider(ctl, {
  label: 'Скорость вращения',
  min: 0.5,
  max: 10,
  step: 0.1,
  value: P.rpm,
  fmt: (v) => `${fixed(v, 1)} об/мин`,
  onInput: (v) => ((P.rpm = v), update()),
});
ui.h = slider(ctl, { label: 'Высота над полом', min: 0.1, max: 20, step: 0.1, value: P.h, fmt: (v) => `${fixed(v, 1)} м`, onInput: (v) => ((P.h = v), update()) });
ui.vFwd = slider(ctl, {
  label: 'Бросок вперёд (+) / назад (−)',
  min: -40,
  max: 40,
  step: 0.1,
  value: P.vFwd,
  fmt: (v) => `${fixed(v, 1)} м/с`,
  hint: '«вперёд» — по направлению вращения',
  onInput: (v) => ((P.vFwd = v), update()),
});
ui.vUp = slider(ctl, { label: 'Бросок вверх (+) / вниз (−)', min: -10, max: 10, step: 0.1, value: P.vUp, fmt: (v) => `${fixed(v, 1)} м/с`, onInput: (v) => ((P.vUp = v), update()) });
ui.slow = slider(ctl, { label: 'Замедление показа', min: 0.1, max: 1, step: 0.05, value: P.slow, fmt: (v) => `×${fixed(v, 2)}`, onInput: (v) => (P.slow = v) });

const pre = document.getElementById('presets');
const setP = (o) => {
  Object.assign(P, o);
  for (const k of Object.keys(o)) if (ui[k]) ui[k].value = P[k];
  update();
};
button(pre, 'Просто уронить', () => setP({ h: 1.5, vFwd: 0, vUp: 0 }));
button(pre, 'С высоты 10 м (грузовой отсек)', () => setP({ h: 10, vFwd: 0, vUp: 0 }));
button(pre, 'Подбросить вверх', () => setP({ h: 1.5, vFwd: 0, vUp: 3 }));
button(pre, 'Бросить вперёд 5 м/с', () => setP({ h: 1.5, vFwd: 5, vUp: 0 }));
button(pre, 'Бросить назад 5 м/с', () => setP({ h: 1.5, vFwd: -5, vUp: 0 }));
button(pre, 'Назад со скоростью пола → «парит»', () => {
  const w = rpmToOmega(P.rpm);
  const R = (P.g * G0) / (w * w);
  setP({ geometry: 'ring', h: 1.5, vUp: 0, vFwd: -Math.round(w * (R - 1.5) * 10) / 10 });
});

function update() {
  const w = rpmToOmega(P.rpm);
  const floorR = (P.g * G0) / (w * w);
  const H = Math.max(3.5, P.h + 1);
  const x0 = floorR - P.h;
  geo = { w, floorR, ceilR: floorR - H, x0, H };
  if (x0 <= 0.2) {
    tr = null;
    document.getElementById('result').innerHTML = '<div class="verdict bad">Высота больше радиуса пола — рука оказалась бы за осью вращения.</div>';
    return;
  }
  tr = dropTrajectory({
    w,
    geometry: P.geometry,
    floorR,
    ceilR: Math.max(0.05, geo.ceilR),
    halfWidth: P.geometry === 'flat' ? HALF : Infinity,
    x0,
    y0: 0,
    vx: -P.vUp,
    vy: P.vFwd,
    samples: 600,
  });
  tAnim = 0;
  hold = 0;
  showResult();
}

function showResult() {
  const { w, floorR, x0 } = geo;
  const e = tr.end;
  const rows = ['#Отсек', ['Радиус пола', len(floorR)], ['Скорость пола', `${num(w * floorR)} м/с`], ['Тяжесть на высоте руки', `${fixed(((x0 / floorR) * P.g), 3)} g`], '#Полёт'];
  const hitName = { floor: 'пол', wall: 'стену', ceil: 'потолок', none: '—' }[tr.what];
  if (tr.tHit == null) {
    rows.push(['Удар', 'за 3 оборота не упало — летает по кругу']);
  } else {
    rows.push(['Попало в', hitName]);
    rows.push(['Время полёта', `${fixed(tr.tHit, 3)} с`]);
    if (P.vFwd === 0 && P.vUp === 0) rows.push(['На Земле с той же тяжестью', `${fixed(Math.sqrt((2 * P.h) / (P.g * G0)), 3)} с`]);
    if (tr.what === 'floor') {
      let off;
      if (P.geometry === 'ring') off = floorR * Math.atan2(e.yr, e.xr);
      else off = e.yr;
      const dir = off < 0 ? 'позади (против вращения)' : 'впереди (по вращению)';
      rows.push(['Точка падения от отвеса', `${len(Math.abs(off))} ${dir}`]);
      const vrel = Math.hypot(e.vxr, e.vyr);
      rows.push(['Скорость удара о пол', `${fixed(vrel, 2)} м/с`]);
      if (P.vFwd === 0 && P.vUp === 0) rows.push(['На Земле', `${fixed(Math.sqrt(2 * P.g * G0 * P.h), 2)} м/с`]);
      // угол к местной вертикали (радиальное направление в точке падения)
      const r = Math.hypot(e.xr, e.yr);
      const cosA = (e.vxr * e.xr + e.vyr * e.yr) / (vrel * r);
      rows.push(['Угол к вертикали при ударе', `${fixed((Math.acos(Math.min(1, cosA)) * 180) / Math.PI, 1)}°`]);
    }
  }
  rows.push(['Скорость в инерциальной СО', `${fixed(tr.speedInertial, 2)} м/с (постоянна)`]);
  kvTable(document.getElementById('result'), rows);
}

const cIn = document.getElementById('vIn');
const cRot = document.getElementById('vRot');

function drawInertial(t) {
  const { ctx, w: W, h: Hh } = fitCanvas(cIn, 1);
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, W, Hh);
  const { w, floorR, ceilR } = geo;
  const k = (Math.min(W, Hh) * 0.46) / floorR;
  const S = (x, y) => [W / 2 + k * x, Hh / 2 - k * y];
  const ang = w * t;
  const rot = (x, y) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 5, Hh / 2);
  ctx.lineTo(W / 2 + 5, Hh / 2);
  ctx.moveTo(W / 2, Hh / 2 - 5);
  ctx.lineTo(W / 2, Hh / 2 + 5);
  ctx.stroke();
  ctx.strokeStyle = '#ffb86b';
  ctx.lineWidth = 2;
  if (P.geometry === 'ring') {
    ctx.beginPath();
    ctx.arc(W / 2, Hh / 2, k * floorR, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,184,107,0.35)';
    ctx.beginPath();
    ctx.arc(W / 2, Hh / 2, k * Math.max(ceilR, 0), 0, 2 * Math.PI);
    ctx.stroke();
  } else {
    const corners = [
      [ceilR, -HALF],
      [floorR, -HALF],
      [floorR, HALF],
      [ceilR, HALF],
    ].map(([x, y]) => S(...rot(x, y)));
    ctx.fillStyle = 'rgba(185,192,202,0.25)';
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(127,209,255,0.4)';
    ctx.lineWidth = 1;
    const [tx, ty] = S(...rot(ceilR, 0));
    ctx.beginPath();
    ctx.moveTo(W / 2, Hh / 2);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  // рука (точка отпускания, вращается с отсеком)
  const [hx, hy] = S(...rot(geo.x0, 0));
  ctx.fillStyle = '#7fd1ff';
  ctx.beginPath();
  ctx.arc(hx, hy, 3, 0, 2 * Math.PI);
  ctx.fill();
  if (!tr) return;
  ctx.strokeStyle = '#e8463b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let last = null;
  for (const p of tr.pts) {
    if (p.t > t) break;
    const [x, y] = S(p.px, p.py);
    if (!last) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    last = [x, y];
  }
  ctx.stroke();
  const st = stateAt(t, tr.P0, tr.V, w);
  const [ax, ay] = S(st.px, st.py);
  drawApple(ctx, ax, ay, 5);
  arrow(ctx, ax, ay, ax + tr.V.x * 2.2, ay - tr.V.y * 2.2, 'rgba(232,70,59,0.7)', 1.5, 6);
  ctx.fillStyle = '#8e99ad';
  ctx.font = '12px system-ui';
  ctx.fillText('ось вращения', W / 2 + 8, Hh / 2 - 8);
  ctx.fillText('вращение ⟲', 10, 18);
}

function drawRotating(t) {
  const { ctx, w: W, h: Hh } = fitCanvas(cRot, 1);
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, W, Hh);
  const { floorR, ceilR, x0 } = geo;
  let ext = HALF + 1;
  if (P.geometry === 'ring' && tr) {
    for (const p of tr.pts) if (p.xr > 0) ext = Math.max(ext, Math.min(Math.abs(p.yr) + 1, 30));
  }
  const vspan = floorR - ceilR + 2;
  const k = Math.min(W / (2 * ext), (Hh * 0.9) / vspan);
  const top = ceilR - 1 - Math.max(0, (Hh / k - vspan) / 2);
  const S = (xr, yr) => [W / 2 + k * yr, (xr - top) * k];
  ctx.strokeStyle = '#ffb86b';
  ctx.lineWidth = 3;
  if (P.geometry === 'flat') {
    ctx.beginPath();
    ctx.moveTo(...S(floorR, -HALF));
    ctx.lineTo(...S(floorR, HALF));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(185,192,202,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...S(ceilR, -HALF));
    ctx.lineTo(...S(floorR, -HALF));
    ctx.moveTo(...S(ceilR, HALF));
    ctx.lineTo(...S(floorR, HALF));
    ctx.moveTo(...S(ceilR, -HALF));
    ctx.lineTo(...S(ceilR, HALF));
    ctx.stroke();
  } else {
    for (const [R, col, lw] of [
      [floorR, '#ffb86b', 3],
      [ceilR, 'rgba(185,192,202,0.6)', 2],
    ]) {
      if (R <= 0) continue;
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      const a = Math.min(Math.PI / 2, (ext * 1.2) / R);
      for (let i = 0; i <= 120; i++) {
        const al = -a + (2 * a * i) / 120;
        const [x, y] = S(R * Math.cos(al), R * Math.sin(al));
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  // отвес: радиальная линия через точку отпускания
  ctx.strokeStyle = '#9aa5b8';
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(...S(x0, 0));
  ctx.lineTo(...S(floorR, 0));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#7fd1ff';
  ctx.beginPath();
  ctx.arc(...S(x0, 0), 3, 0, 2 * Math.PI);
  ctx.fill();
  if (!tr) return;
  ctx.strokeStyle = '#e8463b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (const p of tr.pts) {
    if (p.t > t) break;
    if (p.xr < 0) continue;
    const [x, y] = S(p.xr, p.yr);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const st = stateAt(t, tr.P0, tr.V, geo.w);
  if (st.xr > 0) drawApple(ctx, ...S(st.xr, st.yr), 7);
  ctx.fillStyle = '#8e99ad';
  ctx.font = '12px system-ui';
  ctx.fillText('вращение →', W - 90, 18);
  ctx.fillText('↓ «вниз» = от оси', 10, 18);
  ctx.fillText(`t = ${fixed(t, 2)} с`, 10, Hh - 10);
}

let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  if (tr && geo) {
    const tEnd = tr.tHit ?? (2 * Math.PI) / geo.w;
    if (tAnim < tEnd) tAnim = Math.min(tEnd, tAnim + dt * P.slow);
    else {
      hold += dt;
      if (hold > 1.5) {
        tAnim = 0;
        hold = 0;
      }
    }
    drawInertial(tAnim);
    drawRotating(tAnim);
  }
  requestAnimationFrame(frame);
}

update();
requestAnimationFrame(frame);
