import { initPage, fitCanvas, num, len, mass, period } from '../ui/common.js';
import { drawShip, makeStars, drawStars } from '../ui/draw.js';
import { STARSHIP, G0, LEO_MEAN_MOTION } from '../physics/constants.js';
import { TETHER_MATERIALS } from '../physics/materials.js';
import { designTether, spinAxisPrecession } from '../physics/sizing.js';

initPage('home');

const input = { ...STARSHIP, gDeck: 1, rpm: 4, mat: TETHER_MATERIALS.dyneema, SF: 3, eta: 0.5 };
const d = designTether(input);

document.getElementById('numbersCaption').textContent =
  'Два корабля по 150 т, 1 g на полу жилой палубы, 4 об/мин, трос Dyneema с запасом прочности 3 (реализация прочности в канате 50 %).';
const spinDv = d.w * d.Rcm * (1 + (input.gyration / d.Rcm) ** 2);
const prop = input.M * (1 - Math.exp(-spinDv / (350 * G0)));
const prec = Math.abs(spinAxisPrecession({ n: LEO_MEAN_MOTION, w: d.w }));
const cards = [
  [len(d.rDeck, 2), 'радиус пола палубы'],
  [len(2 * d.Ra, 2), 'трос между носами'],
  [`Ø ${len(d.diameter, 2)}`, 'диаметр троса'],
  [mass(d.mTether, 2), `масса троса (${num(d.tetherFraction * 100, 1)} % кораблей)`],
  [`${num(d.vRim, 2)} м/с`, 'скорость кораблей по кругу'],
  [period((2 * Math.PI) / d.wBounce), 'период «подпрыгивания» на тросе'],
  [period((2 * Math.PI) / d.pitch.sym), 'период качания кораблей'],
  [mass(prop, 2), 'топлива на раскрутку каждому'],
  [`${num(d.coriolisWalk * 100, 2)} %`, 'веса — Кориолис при ходьбе 1 м/с'],
  [period((2 * Math.PI) / prec), 'период прецессии оси на НОО'],
];
document.getElementById('numbers').innerHTML = cards.map(([b, s]) => `<div class="n"><b>${b}</b><span>${s}</span></div>`).join('');

const canvas = document.getElementById('hero');
const stars = makeStars(320, 5);
let phi = 0.4;
let lastNow = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  phi += d.w * dt;
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, w, h);
  drawStars(ctx, stars, w, h);

  // Земля внизу
  const ER = w * 1.6;
  const ex = w * 0.5;
  const ey = h + ER - h * 0.22;
  const atm = ctx.createRadialGradient(ex, ey, ER * 0.995, ex, ey, ER * 1.03);
  atm.addColorStop(0, 'rgba(90,160,255,0.55)');
  atm.addColorStop(1, 'rgba(90,160,255,0)');
  ctx.fillStyle = atm;
  ctx.beginPath();
  ctx.arc(ex, ey, ER * 1.03, 0, 2 * Math.PI);
  ctx.fill();
  const earth = ctx.createLinearGradient(0, h * 0.75, 0, h);
  earth.addColorStop(0, '#1d4f8a');
  earth.addColorStop(1, '#0b2440');
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.arc(ex, ey, ER, 0, 2 * Math.PI);
  ctx.fill();

  // система двух кораблей
  const cx = w * 0.66;
  const cy = h * 0.42;
  const span = d.Ra + STARSHIP.length + 6;
  const k = Math.min(w * 0.3, h * 0.4) / span;
  const S = (x, y) => [cx + k * x, cy - k * y];
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  ctx.strokeStyle = 'rgba(127,209,255,0.12)';
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.arc(cx, cy, k * d.Rcm, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#7fd1ff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(...S(-d.Ra * c, -d.Ra * s));
  ctx.lineTo(...S(d.Ra * c, d.Ra * s));
  ctx.stroke();
  drawShip(ctx, S, k, d.Ra * c, d.Ra * s, phi + Math.PI, STARSHIP.length, STARSHIP.diameter, { deckFromNose: STARSHIP.deckFromNose });
  drawShip(ctx, S, k, -d.Ra * c, -d.Ra * s, phi, STARSHIP.length, STARSHIP.diameter, { deckFromNose: STARSHIP.deckFromNose });
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#8e99ad';
  ctx.font = '12px system-ui';
  ctx.fillText('4 об/мин, реальная скорость', cx - 70, cy + k * span + 16 > h - 8 ? h - 8 : cy + k * span + 16);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
