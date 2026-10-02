// Проверки: каждая формула, показанная на сайте, сверяется с независимым численным
// расчётом. Используется и в node (test/), и на странице verify.html.

import { STARSHIP, LEO_MEAN_MOTION } from './constants.js';
import { TETHER_MATERIALS } from './materials.js';
import { designTether, pitchModes, spinAxisPrecession, bounceOmega } from './sizing.js';
import { TetherSim, simConfigFromDesign } from './sim.js';
import { dropTrajectory, ringDropExact, smallDropDeflection, flatDropExact } from './drop.js';
import { climbForces, inertialAccelFD } from './climb.js';

export const DEFAULT_DESIGN_INPUT = {
  ...STARSHIP,
  gDeck: 1,
  rpm: 4,
  mat: TETHER_MATERIALS.dyneema,
  SF: 3,
  eta: 0.5,
};

const relErr = (got, exp) => Math.abs(got - exp) / Math.abs(exp);
const num = (x) => x.toPrecision(3);

function result(got, expected, tol, extra = {}) {
  const err = relErr(got, expected);
  return { got, expected, err, tol, pass: err <= tol, ...extra };
}

/** Частота по пересечениям среднего уровня снизу вверх (рад/с). */
export function measureOmega(ts, ys) {
  const mean = ys.reduce((p, q) => p + q, 0) / ys.length;
  const cross = [];
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1] - mean;
    const b = ys[i] - mean;
    if (a <= 0 && b > 0) cross.push(ts[i - 1] + ((ts[i] - ts[i - 1]) * -a) / (b - a));
  }
  if (cross.length < 3) return NaN;
  return (2 * Math.PI * (cross.length - 1)) / (cross[cross.length - 1] - cross[0]);
}

function record(sim, duration, dtSample, probe) {
  const ts = [];
  const ys = [];
  const n = Math.round(duration / dtSample);
  for (let i = 0; i <= n; i++) {
    ts.push(sim.t);
    ys.push(probe(sim));
    sim.advance(dtSample);
  }
  return { ts, ys };
}

function baseSim(over = {}, N = 24) {
  const d = designTether(DEFAULT_DESIGN_INPUT);
  const cfg = { ...simConfigFromDesign(d, DEFAULT_DESIGN_INPUT, N), ...over };
  return { d, sim: new TetherSim(cfg) };
}

// --- кватернионы для проверки прецессии -------------------------------------
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qrot = (q, v) => {
  const r = qmul(qmul(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]]);
  return [r[1], r[2], r[3]];
};
const qrotInv = (q, v) => qrot([q[0], -q[1], -q[2], -q[3]], v);
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const CHECKS = [
  {
    id: 'steady',
    title: 'Стационарное вращение: модель держит равновесие, натяжение у корабля = M·ω²·R_цм',
    explain:
      'Симуляция стартует из рассчитанного равновесия. Если формулы и численная модель согласованы, за 20 с натяжение не должно сдвинуться, а его величина — совпасть с аналитической.',
    run() {
      const { d, sim } = baseSim();
      const N = sim.N;
      const h = (2 * d.Ra) / N;
      const xm = d.Ra - h / 2;
      const expected = d.Ta + (d.rhoA * d.w * d.w * (d.Ra * d.Ra - xm * xm)) / 2;
      const T0 = sim.T[N - 1];
      // натяжение у оси (отрезок с центром x = h/2) и удлинение — против формул проекта
      const errAxis = relErr(sim.T[N / 2], d.T0 - (d.rhoA * d.w * d.w * (h / 2) ** 2) / 2);
      const errStretch = relErr(sim.noseRadius() - sim.restLength() / 2, d.stretchHalf);
      const errSizing = relErr(d.T0 / d.A, d.sAllow);
      let maxDev = 0;
      for (let i = 0; i < 200; i++) {
        sim.advance(0.1);
        maxDev = Math.max(maxDev, Math.abs(sim.T[N - 1] - T0) / T0);
      }
      const r = result(sim.T[N - 1], expected, 1e-3, { unit: 'Н' });
      r.pass = r.pass && maxDev < 1e-6 && errAxis < 2e-5 && errStretch < 1e-4 && errSizing < 1e-9;
      r.note = `дрейф за 20 с: ${maxDev.toExponential(1)}; T0 на оси: ${errAxis.toExponential(1)}; удлинение: ${errStretch.toExponential(1)}; T0/A = σ_доп: ${errSizing.toExponential(1)}`;
      return r;
    },
  },
  {
    id: 'heavy',
    title: 'Тяжёлый трос: натяжение T(x) = Ta + ρA·ω²·(Ra² − x²)/2',
    explain:
      'Трос нарочно сделан тяжёлым (40 % массы корабля) и почти нерастяжимым, чтобы вклад его массы был заметен. Сравниваем натяжение на оси, полученное из баланса сил узлов, с формулой, и проверяем, что это действительно равновесие динамики.',
    run() {
      const d = designTether(DEFAULT_DESIGN_INPUT);
      const rhoA = (0.2 * STARSHIP.M) / d.Ra;
      const cfg = { ...simConfigFromDesign(d, DEFAULT_DESIGN_INPUT, 40), rhoA, EA: d.EA * 1e4 };
      const sim = new TetherSim(cfg);
      const Ta = STARSHIP.M * d.w * d.w * (d.Ra + STARSHIP.cmFromNose);
      const mid = sim.T[sim.N / 2];
      const xm = (2 * d.Ra) / sim.N / 2;
      const expected = Ta + (rhoA * d.w * d.w * (d.Ra * d.Ra - xm * xm)) / 2;
      const T0 = mid;
      sim.advance(5);
      const drift = Math.abs(sim.T[sim.N / 2] - T0) / T0;
      const r = result(mid, expected, 1e-3, { unit: 'Н' });
      r.pass = r.pass && drift < 2e-3;
      r.note = `вклад массы троса ${(((expected - Ta) / expected) * 100).toFixed(1)} %; дрейф за 5 с ${drift.toExponential(1)}`;
      return r;
    },
  },
  {
    id: 'angmom',
    title: 'Сохранение момента импульса (толчок, трение в тросе, работа лебёдки)',
    explain:
      'Все внутренние силы центральные, поэтому полный момент импульса должен сохраняться точно — даже при трении и сматывании троса.',
    run() {
      const { sim } = baseSim();
      const L0 = sim.angularMomentum();
      sim.kickRadial(0.5);
      sim.kickPitch(0.01, false);
      sim.pluck(0.5);
      const L1 = sim.angularMomentum();
      sim.ctrl.reelRate = -0.5;
      sim.advance(10);
      const r = result(sim.angularMomentum(), L1, 1e-9, { unit: 'кг·м²/с' });
      r.note = `толчки изменили L на ${relErr(L1, L0).toExponential(1)} (внутренние, должно быть ≈0)`;
      r.pass = r.pass && relErr(L1, L0) < 1e-9;
      return r;
    },
  },
  {
    id: 'thrust',
    title: 'Двигатели: момент импульса растёт как 2·F·r',
    explain:
      'Двигатели каждого корабля дают касательную силу F в центре масс. Внешний момент 2·F·r (r — расстояние ЦМ корабля от оси), поэтому прирост момента импульса за время разгона — интеграл 2·F·r по времени. Проверяет знак и точку приложения тяги.',
    run() {
      const { sim } = baseSim();
      const F = 50e3;
      sim.ctrl.thrust = F;
      const L0 = sim.angularMomentum();
      const arm = (s) => s.ships.reduce((p, sh) => p + Math.hypot(sh.x, sh.y), 0);
      const dt = 0.01;
      let integral = 0;
      let prev = arm(sim);
      for (let k = 0; k < 500; k++) {
        sim.advance(dt);
        const cur = arm(sim);
        integral += 0.5 * (prev + cur) * F * dt;
        prev = cur;
      }
      const r = result(sim.angularMomentum() - L0, integral, 1e-4, { unit: 'кг·м²/с' });
      r.note = `за 5 с: ω ${(sim.spinRate() / baseSim().d.w - 1).toExponential(2)} относительно начальной`;
      return r;
    },
  },
  {
    id: 'energy',
    title: 'Сохранение энергии без трения',
    explain:
      'Без внутреннего трения и без лебёдки полная механическая энергия (кинетическая + упругая) должна сохраняться. Ошибку меряем относительно энергии возмущения (толчков), а не огромной энергии вращения — иначе проверка была бы слепой.',
    run() {
      const { sim } = baseSim({ zeta: 0 });
      const Eb = sim.energy();
      sim.kickRadial(0.3);
      sim.kickPitch(0.005, true);
      sim.pluck(0.3);
      const E0 = sim.energy();
      const Ep = E0 - Eb;
      let maxDev = 0;
      for (let i = 0; i < 300; i++) {
        sim.advance(0.1);
        maxDev = Math.max(maxDev, Math.abs(sim.energy() - E0) / Ep);
      }
      return {
        got: maxDev,
        expected: 0,
        err: maxDev,
        tol: 1e-5,
        pass: maxDev < 1e-5,
        note: `макс. отклонение энергии за 30 с в долях энергии толчков (${num(Ep / 1000)} кДж)`,
      };
    },
  },
  {
    id: 'bounce',
    title: 'Частота продольных колебаний («подпрыгивание» кораблей на тросе)',
    explain:
      'Формула: ω² = EA/(l₀·(M + m_троса/6)) + 3ω_вр². Чтобы проверка видела все члены, трос нарочно мягкий (растяжение ~5 %) и тяжёлый (30 % массы корабля): тогда член 3ω² — около 5 % от ω², поправка на массу троса — тоже, и допуск 0,3 % их различает. Толкаем корабли вдоль троса и измеряем частоту колебаний расстояния между ними.',
    run() {
      const d = designTether(DEFAULT_DESIGN_INPUT);
      const EA = d.EA / 10;
      const rhoA = (0.15 * STARSHIP.M) / d.Ra;
      const sim = new TetherSim({ ...simConfigFromDesign(d, DEFAULT_DESIGN_INPUT), EA, rhoA, Tbreak: Infinity });
      const l0 = sim.restLength() / 2;
      const expected = bounceOmega({ EA, l0, M: STARSHIP.M, mTether: rhoA * 2 * l0, w: d.w });
      sim.kickRadial(0.05);
      const { ts, ys } = record(sim, 30, 0.01, (s) => s.shipDistance());
      const r = result(measureOmega(ts, ys), expected, 3e-3, { unit: 'рад/с' });
      const def = baseSim();
      def.sim.kickRadial(0.1);
      const rec = record(def.sim, 15, 0.01, (s) => s.shipDistance());
      const errDef = relErr(measureOmega(rec.ts, rec.ys), def.d.wBounce);
      r.pass = r.pass && errDef < 1e-3;
      r.note = `растяжение ${((sim.noseRadius() / l0 - 1) * 100).toFixed(1)} %; параметры по умолчанию: ошибка ${errDef.toExponential(1)}`;
      return r;
    },
  },
  {
    id: 'snap',
    title: 'Провис и рывок: пик натяжения = Ta·(1 + размах/растяжение)',
    explain:
      'Толкаем корабли друг от друга так, что размах колебаний в 1,5 раза больше статического растяжения троса: на обратном ходе трос провисает целиком, корабли летят свободно, а затем трос дёргается. Энергия на внешнем ходе та же, поэтому пик натяжения должен быть 2,5·Ta. Меряем пики на втором и третьем ходах — после настоящего провиса.',
    run() {
      const { d, sim } = baseSim({ Tbreak: Infinity });
      const f = 1.5;
      sim.kickRadial(f * 2 * d.stretchHalf * d.wBounce);
      // ход — участок, где натяжение у корабля выше 0,3·Ta; между ходами трос провисает
      const peaks = [];
      let inStroke = false;
      let fullSlack = 0;
      for (let i = 0; i < 2000 && peaks.length < 4; i++) {
        sim.advance(0.002);
        const T = sim.T[sim.N - 1];
        if (sim.slackCount() === sim.N) fullSlack++;
        if (T > 0.3 * d.Ta) {
          if (!inStroke) peaks.push(0);
          inStroke = true;
          peaks[peaks.length - 1] = Math.max(peaks[peaks.length - 1], T);
        } else inStroke = false;
      }
      const exp = d.Ta * (1 + f);
      const later = peaks.slice(1, 3);
      const r = result(later.length ? Math.min(...later) : 0, exp, 0.03, { unit: 'Н' });
      r.pass = r.pass && later.length === 2 && relErr(Math.max(...later), exp) < 0.03 && fullSlack > 0;
      r.note = `пики по ходам, ×Ta: ${peaks.map((p) => (p / d.Ta).toFixed(3)).join(', ')} (ожидание ${(1 + f).toFixed(2)}); полный провис ${(fullSlack * 2).toFixed(0)} мс`;
      return r;
    },
  },
  {
    id: 'string',
    title: 'Поперечная волна в тросе (первая мода струны)',
    explain:
      'Для цепочки из N бусин с натяжением T: ω₁² = (4T/(m·h))·sin²(π/2N) − ω_вр² (в плоскости вращения центробежная сила слегка ослабляет возврат). При N → ∞ это (π/2Ra)·√(T/ρA).',
    run() {
      const { d, sim } = baseSim();
      const N = sim.N;
      const Tm = sim.T.reduce((p, q) => p + q, 0) / N;
      let mm = 0;
      for (let k = 1; k < N; k++) mm += sim.m[k];
      mm /= N - 1;
      const h = (2 * d.Ra) / N;
      const expected = Math.sqrt(((4 * Tm) / (mm * h)) * Math.sin(Math.PI / (2 * N)) ** 2 - d.w * d.w);
      sim.pluck(0.2);
      const probe = (s) => {
        const ex = s.x[N] - s.x[0];
        const ey = s.y[N] - s.y[0];
        const L = Math.hypot(ex, ey);
        const cx = s.x[N / 2] - 0.5 * (s.x[0] + s.x[N]);
        const cy = s.y[N / 2] - 0.5 * (s.y[0] + s.y[N]);
        return (ex * cy - ey * cx) / L;
      };
      const period = (2 * Math.PI) / expected;
      const { ts, ys } = record(sim, 12 * period, period / 60, probe);
      const measured = measureOmega(ts, ys);
      const r = result(measured, expected, 0.02, { unit: 'рад/с' });
      const errCont = relErr(measured, d.wString);
      r.pass = r.pass && errCont < 0.01;
      r.note = `формула сайта (непрерывная струна): ${d.wString.toFixed(2)} рад/с, расхождение ${(errCont * 100).toFixed(2)} %`;
      return r;
    },
  },
  {
    id: 'pitchSym',
    title: 'Качание кораблей: симметричная мода',
    explain: 'Формула: Ω² = ω²·a·(M·Rcm² + I)/(I·Ra). Оба корабля толкаем по тангажу в одну сторону.',
    run() {
      const { d, sim } = baseSim();
      const expected = pitchModes({ M: sim.Ms, I: sim.Is, a: sim.as, Ra: sim.noseRadius(), w: d.w }).sym;
      sim.kickPitch(0.002, true);
      const period = (2 * Math.PI) / expected;
      const { ts, ys } = record(sim, 8 * period, period / 80, (s) => s.pitchAngle(1));
      return result(measureOmega(ts, ys), expected, 0.02, { unit: 'рад/с' });
    },
  },
  {
    id: 'pitchAnti',
    title: 'Качание кораблей: антисимметричная мода',
    explain: 'Формула: Ω² = ω²·M·Rcm·a/I. Корабли толкаем по тангажу в разные стороны; середина троса при этом смещается вбок.',
    run() {
      const { d, sim } = baseSim();
      const expected = pitchModes({ M: sim.Ms, I: sim.Is, a: sim.as, Ra: sim.noseRadius(), w: d.w }).anti;
      sim.kickPitch(0.002, false);
      const period = (2 * Math.PI) / expected;
      const { ts, ys } = record(sim, 8 * period, period / 80, (s) => s.pitchAngle(1));
      return result(measureOmega(ts, ys), expected, 0.02, { unit: 'рад/с' });
    },
  },
  {
    id: 'deck',
    title: 'Ощущаемая тяжесть на палубе при качании: формула против численного дифференцирования',
    explain:
      'Модуль и наклон «вертикали» на палубе считаются из сил и углового ускорения корабля (переносное, центростремительное и эйлерово ускорения). Здесь ускорение точки палубы берётся второй разностью её положения по шагам симуляции. При качании на ~0,4° наклон вертикали должен быть в несколько раз больше.',
    run() {
      const { sim } = baseSim();
      const i = 1;
      sim.kickPitch(0.01, false);
      sim.kickRadial(0.2);
      sim.advance(3.3);
      const deck = (s) => {
        const sh = s.ships[i];
        const rho = s.as - s.cfg.deckFromNose;
        return [sh.x + rho * Math.cos(sh.th), sh.y + rho * Math.sin(sh.th)];
      };
      const dt = sim.stableDt();
      const P0 = deck(sim);
      sim.step(dt);
      const P1 = deck(sim);
      const g = sim.deckGravity(i);
      const pitch = sim.pitchAngle(i);
      const th = sim.ships[i].th;
      sim.step(dt);
      const P2 = deck(sim);
      const gx = -(P2[0] - 2 * P1[0] + P0[0]) / (dt * dt);
      const gy = -(P2[1] - 2 * P1[1] + P0[1]) / (dt * dt);
      // наклон — угол от оси корабля «к хвосту» (−e) до ощущаемой вертикали, против часовой
      const ex = Math.cos(th);
      const ey = Math.sin(th);
      const tilt = Math.atan2(-ex * gy + ey * gx, -ex * gx - ey * gy);
      const r = result(g.g, Math.hypot(gx, gy), 1e-5, { unit: 'м/с²' });
      const dTilt = Math.abs(g.tilt - tilt);
      r.pass = r.pass && dTilt < 1e-5 && Math.abs(tilt) > 0.01;
      r.note = `качание ${((pitch * 180) / Math.PI).toFixed(2)}°, наклон вертикали ${((tilt * 180) / Math.PI).toFixed(2)}° (формула ${((g.tilt * 180) / Math.PI).toFixed(2)}°)`;
      return r;
    },
  },
  {
    id: 'reel',
    title: 'Лебёдка и «эффект фигуриста»: подтянули трос — вращение ускорилось',
    explain:
      'Сматываем 20 % троса. Новая скорость вращения предсказывается из сохранения момента импульса и нового равновесного радиуса (с учётом растяжения троса).',
    run() {
      const { d, sim } = baseSim();
      const L = sim.angularMomentum();
      const target = 0.8 * sim.restLength();
      sim.ctrl.mode = 'manual';
      sim.ctrl.reelRate = -0.5;
      while (sim.restLength() > target) sim.advance(Math.min(0.05, (sim.restLength() - target) / 0.5 + 1e-4));
      sim.ctrl.reelRate = 0;
      sim.advance(2);
      // предсказание: найти Ra, при котором растянутая полудлина согласована с натяжением
      const N = sim.N;
      const Ra0 = d.Ra;
      const xs0 = Array.from({ length: N - 1 }, (_, i) => -Ra0 + (i + 1) * ((2 * Ra0) / N));
      const restHalf = sim.restLength() / 2;
      let Ra = restHalf;
      let w = 0;
      for (let it = 0; it < 50; it++) {
        const scale = Ra / Ra0;
        let It = 0;
        for (let k = 1; k < N; k++) It += sim.m[k] * (xs0[k - 1] * scale) ** 2;
        const I = 2 * (sim.Ms * (Ra + sim.as) ** 2 + sim.Is) + It;
        w = L / I;
        const Tend = sim.Ms * w * w * (Ra + sim.as);
        Ra = restHalf * (1 + Tend / d.EA);
      }
      const ts = [];
      let acc = 0;
      let n = 0;
      for (let i = 0; i < 200; i++) {
        sim.advance(0.05);
        acc += sim.spinRate();
        n++;
        ts.push(sim.t);
      }
      const r = result(acc / n, w, 3e-3, { unit: 'рад/с' });
      r.note = `ω: ${d.w.toFixed(4)} → ${w.toFixed(4)} рад/с`;
      return r;
    },
  },
  {
    id: 'dropRing',
    title: 'Яблоко на кольцевой станции: численная траектория против точного решения',
    explain: 'Точное решение: φ = arccos((R−h)/R), t = tg φ/ω, отставание по дуге R·(tg φ − φ).',
    run() {
      const R = 56;
      const h = 2;
      const w = Math.sqrt(9.80665 / R);
      const tr = dropTrajectory({ w, geometry: 'ring', floorR: R, ceilR: 1, x0: R - h });
      const ex = ringDropExact(R, h, w);
      const arc = -R * Math.atan2(tr.end.yr, tr.end.xr);
      const r = result(arc, ex.arc, 1e-6, { unit: 'м' });
      r.pass = r.pass && relErr(tr.tHit, ex.t) < 1e-6;
      r.note = `время падения ${tr.tHit.toFixed(4)} с (точно ${ex.t.toFixed(4)} с)`;
      return r;
    },
  },
  {
    id: 'dropSmall',
    title: 'Яблоко с малой высоты: совпадение с «земной» формулой отклонения ω·g·t³/3',
    explain: 'При h ≪ R точное решение должно переходить в известную формулу отклонения падающего тела силой Кориолиса.',
    run() {
      const R = 56;
      const h = 0.05;
      const w = Math.sqrt(9.80665 / R);
      return result(ringDropExact(R, h, w).arc, smallDropDeflection(R, h), 0.01, { unit: 'м' });
    },
  },
  {
    id: 'dropFlat',
    title: 'Яблоко на плоской палубе корабля: численная траектория против точного решения',
    explain: 'Точное решение: x = r₀(cos θ + θ sin θ), y = r₀(θ cos θ − sin θ), θ = ωt.',
    run() {
      const R = 56;
      const h = 1.5;
      const w = Math.sqrt(9.80665 / R);
      const tr = dropTrajectory({ w, geometry: 'flat', floorR: R, ceilR: R - 3, halfWidth: 4.5, x0: R - h });
      const ex = flatDropExact(R, h, w);
      const r = result(tr.end.yr, ex.y, 1e-6, { unit: 'м' });
      r.pass = r.pass && relErr(tr.tHit, ex.t) < 1e-6;
      return r;
    },
  },
  {
    id: 'dropRot',
    title: 'Яблоко: независимый расчёт во вращающейся системе (Кориолис + центробежная сила)',
    explain:
      'Модель яблока считает прямую в инерциальной системе. Здесь то же падение интегрируется методом Рунге–Кутты прямо во вращающейся системе, с ускорением ω²r − 2ω×v. Сравниваем точку падения на плоской палубе и на кольце.',
    run() {
      const R = 56;
      const h = 1.5;
      const w = Math.sqrt(9.80665 / R);
      const fall = (hit) => {
        let s = [R - h, 0, 0, 0];
        const f = ([x, y, vx, vy]) => [vx, vy, w * w * x + 2 * w * vy, w * w * y - 2 * w * vx];
        const dt = 1e-4;
        for (let i = 0; i < 1e6; i++) {
          const k1 = f(s);
          const k2 = f(s.map((c, j) => c + (dt / 2) * k1[j]));
          const k3 = f(s.map((c, j) => c + (dt / 2) * k2[j]));
          const k4 = f(s.map((c, j) => c + dt * k3[j]));
          const n = s.map((c, j) => c + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
          if (hit(n) >= 0) {
            const u = -hit(s) / (hit(n) - hit(s));
            return s.map((c, j) => c + u * (n[j] - c));
          }
          s = n;
        }
        return s;
      };
      const flat = fall(([x]) => x - R);
      const ring = fall(([x, y]) => Math.hypot(x, y) - R);
      const trF = dropTrajectory({ w, geometry: 'flat', floorR: R, ceilR: R - 3, halfWidth: 4.5, x0: R - h });
      const trR = dropTrajectory({ w, geometry: 'ring', floorR: R, ceilR: 1, x0: R - h });
      const arcRK = R * Math.atan2(ring[1], ring[0]);
      const arcModel = R * Math.atan2(trR.end.yr, trR.end.xr);
      const r = result(trF.end.yr, flat[1], 1e-5, { unit: 'м' });
      const errRing = relErr(arcModel, arcRK);
      r.pass = r.pass && errRing < 1e-5;
      r.note = `плоская палуба ${(flat[1] * 100).toFixed(2)} см, кольцо ${(arcRK * 100).toFixed(2)} см по дуге (расхождение ${errRing.toExponential(1)})`;
      return r;
    },
  },
  {
    id: 'climb',
    title: 'Переход по тросу: сила Кориолиса и «вес» против численного дифференцирования',
    explain:
      'Берём движение вдоль вращающегося троса x(t), строим инерциальную траекторию и дважды дифференцируем численно. Ускорение должно совпасть с (ẍ − ω²x, 2ωẋ).',
    run() {
      const w = 0.42;
      const xOf = (t) => 56 - 0.7 * t + 0.03 * t * t;
      let worst = 0;
      for (const t of [0.5, 5, 20, 40]) {
        const x = xOf(t);
        const xd = -0.7 + 0.06 * t;
        const F = climbForces(x, xd, 0.06, w, 1);
        const fd = inertialAccelFD(xOf, w, t);
        const scale = Math.hypot(F.along, F.across);
        worst = Math.max(worst, Math.abs(fd.along - F.along) / scale, Math.abs(fd.across - F.across) / scale);
      }
      return { got: worst, expected: 0, err: worst, tol: 1e-5, pass: worst < 1e-5, note: 'макс. относительное расхождение' };
    },
  },
  {
    id: 'ring',
    title: 'Кольцо: натяжение обода T = λ·v² удерживает вращающееся кольцо',
    explain:
      'Кольцо из 400 бусин на упругих связях раскручено до скорости v, длины связей рассчитаны из T = λv². Если формула неверна, кольцо начнёт «дышать»: радиус будет меняться на величину порядка деформации (~1 %).',
    run() {
      const N = 400;
      const R = 225;
      const v = 47;
      const lam = 1000;
      const T = lam * v * v;
      const EA = 100 * T;
      const m = (lam * 2 * Math.PI * R) / N;
      const chord = 2 * R * Math.sin(Math.PI / N);
      const l = chord / (1 + T / EA);
      const w = v / R;
      const x = new Float64Array(N);
      const y = new Float64Array(N);
      const vx = new Float64Array(N);
      const vy = new Float64Array(N);
      const fx = new Float64Array(N);
      const fy = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const a = (2 * Math.PI * i) / N;
        x[i] = R * Math.cos(a);
        y[i] = R * Math.sin(a);
        vx[i] = -w * y[i];
        vy[i] = w * x[i];
      }
      const k = EA / l;
      const dt = 0.4 * Math.sqrt(m / k);
      const steps = Math.round((2 * Math.PI) / w / dt);
      let worst = 0;
      for (let s = 0; s < steps; s++) {
        fx.fill(0);
        fy.fill(0);
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          const dx = x[j] - x[i];
          const dy = y[j] - y[i];
          const d = Math.hypot(dx, dy);
          const F = k * (d - l);
          fx[i] += (F * dx) / d;
          fy[i] += (F * dy) / d;
          fx[j] -= (F * dx) / d;
          fy[j] -= (F * dy) / d;
        }
        for (let i = 0; i < N; i++) {
          vx[i] += (fx[i] / m) * dt;
          vy[i] += (fy[i] / m) * dt;
          x[i] += vx[i] * dt;
          y[i] += vy[i] * dt;
        }
        if (s % 50 === 0) worst = Math.max(worst, Math.abs(Math.hypot(x[0], y[0]) - R) / R);
      }
      return { got: worst, expected: 0, err: worst, tol: 1e-4, pass: worst < 1e-4, note: 'макс. относительное изменение радиуса за оборот' };
    },
  },
  {
    id: 'precession',
    title: 'Прецессия оси вращения в гравитационном поле Земли (гантель на орбите)',
    explain:
      'Интегрируем уравнения Эйлера твёрдого тела с моментом гравитационного градиента 3n²·ô×(Iô) на круговой орбите. Для гантели I_z = I_x + I_y, I_x ≪ I_y. Ожидание: Ω_p = −(3/4)(n²/ω)·cos β. Для скорости счёта n/ω = 1/50; на реальной НОО n/ω ≈ 1/400 и формула ещё точнее.',
    run() {
      const Ix = 0.02;
      const Iy = 1;
      const Iz = Ix + Iy;
      const Iv = [Ix, Iy, Iz];
      const w0 = 1;
      const n = 0.02;
      const beta = Math.PI / 4;
      const ratio = (Iz - (Ix + Iy) / 2) / Iz;
      const expected = spinAxisPrecession({ n, w: w0, beta, inertiaRatio: ratio });
      let q = [Math.cos(beta / 2), 0, Math.sin(beta / 2), 0];
      let om = [0, 0, w0];
      const deriv = (t, q, om) => {
        const rhat = [Math.cos(n * t), Math.sin(n * t), 0];
        const o = qrotInv(q, rhat);
        const Io = [Iv[0] * o[0], Iv[1] * o[1], Iv[2] * o[2]];
        const tq = cross3(o, Io).map((c) => 3 * n * n * c);
        const Iom = [Iv[0] * om[0], Iv[1] * om[1], Iv[2] * om[2]];
        const gy = cross3(om, Iom);
        const domega = [0, 1, 2].map((i) => (tq[i] - gy[i]) / Iv[i]);
        const dq = qmul(q, [0, ...om]).map((c) => 0.5 * c);
        return { dq, domega };
      };
      const dt = 0.02;
      // целое число орбит: колебание с удвоенной орбитальной частотой не смещает наклон
      const tEnd = (5 * 2 * Math.PI) / n;
      const ts = [];
      const az = [];
      let t = 0;
      let last = 0;
      let unwrap = 0;
      const steps = Math.round(tEnd / dt);
      for (let s = 0; s <= steps; s++) {
        if (s % 100 === 0) {
          const a = qrot(q, [0, 0, 1]);
          let ang = Math.atan2(a[1], a[0]);
          if (ang - last > Math.PI) unwrap -= 2 * Math.PI;
          if (ang - last < -Math.PI) unwrap += 2 * Math.PI;
          last = ang;
          ts.push(t);
          az.push(ang + unwrap);
        }
        const add = (q0, om0, k, h) => [q0.map((c, i) => c + h * k.dq[i]), om0.map((c, i) => c + h * k.domega[i])];
        const k1 = deriv(t, q, om);
        const [q2, o2] = add(q, om, k1, dt / 2);
        const k2 = deriv(t + dt / 2, q2, o2);
        const [q3, o3] = add(q, om, k2, dt / 2);
        const k3 = deriv(t + dt / 2, q3, o3);
        const [q4, o4] = add(q, om, k3, dt);
        const k4 = deriv(t + dt, q4, o4);
        q = q.map((c, i) => c + (dt / 6) * (k1.dq[i] + 2 * k2.dq[i] + 2 * k3.dq[i] + k4.dq[i]));
        om = om.map((c, i) => c + (dt / 6) * (k1.domega[i] + 2 * k2.domega[i] + 2 * k3.domega[i] + k4.domega[i]));
        const nq = Math.hypot(...q);
        q = q.map((c) => c / nq);
        t += dt;
      }
      const mt = ts.reduce((p, c) => p + c, 0) / ts.length;
      const ma = az.reduce((p, c) => p + c, 0) / az.length;
      let num = 0;
      let den = 0;
      for (let i = 0; i < ts.length; i++) {
        num += (ts[i] - mt) * (az[i] - ma);
        den += (ts[i] - mt) ** 2;
      }
      const r = result(num / den, expected, 0.03, { unit: 'рад/с' });
      const leo = spinAxisPrecession({ n: LEO_MEAN_MOTION, w: designTether(DEFAULT_DESIGN_INPUT).w, beta: 0 });
      r.note = `для НОО и 4 об/мин период прецессии ≈ ${((2 * Math.PI) / Math.abs(leo) / 86400).toFixed(0)} сут × 1/cos β`;
      return r;
    },
  },
];

export function runAll(filter) {
  return CHECKS.filter((c) => !filter || filter(c)).map((c) => {
    const t0 = Date.now();
    let res;
    try {
      res = c.run();
    } catch (e) {
      res = { pass: false, error: String(e && e.stack ? e.stack : e) };
    }
    return { id: c.id, title: c.title, ms: Date.now() - t0, ...res };
  });
}
