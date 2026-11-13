// «Что будет с яблоком»: свободный полёт предмета внутри вращающегося отсека.
//
// В инерциальной системе отпущенный предмет летит по прямой с постоянной скоростью
// (сил нет). Вращающаяся система: ось x — от оси вращения наружу (к полу),
// ось y — по направлению вращения («вперёд»). Вращение против часовой стрелки.
// Для перехода повернуть инерциальные координаты на −ωt.
//
// Геометрия пола:
//  • 'flat' — плоская палуба корабля на тросе: пол x = floorR, потолок x = ceilR,
//    стены |y| = halfWidth;
//  • 'ring' — кольцевая станция: пол — окружность |r| = floorR, потолок |r| = ceilR.

/** Положение в инерциальной СО и во вращающейся СО в момент t. */
export function stateAt(t, P0, V, w) {
  const px = P0.x + V.x * t;
  const py = P0.y + V.y * t;
  const c = Math.cos(w * t);
  const s = Math.sin(w * t);
  const xr = px * c + py * s;
  const yr = -px * s + py * c;
  const vxr = V.x * c + V.y * s + w * yr;
  const vyr = -V.x * s + V.y * c - w * xr;
  return { px, py, xr, yr, vxr, vyr };
}

/**
 * Начальные условия во вращающейся СО: точка (x0, y0), относительная скорость (vx, vy).
 * Возвращает момент удара, где именно и траектории в обеих СО.
 */
export function dropTrajectory({ w, geometry = 'flat', floorR, ceilR, halfWidth = Infinity, x0, y0 = 0, vx = 0, vy = 0, samples = 400 }) {
  const P0 = { x: x0, y: y0 };
  const V = { x: vx - w * y0, y: vy + w * x0 };
  // отрицательное значение = внутри отсека
  const inside = (t) => {
    const st = stateAt(t, P0, V, w);
    if (geometry === 'ring') {
      const r = Math.hypot(st.px, st.py);
      return { floor: r - floorR, ceil: ceilR - r, wall: -1 };
    }
    return { floor: st.xr - floorR, ceil: ceilR - st.xr, wall: Math.abs(st.yr) - halfWidth };
  };
  const period = (2 * Math.PI) / w;
  const tMax = 3 * period;
  const dt = period / 4000;
  let tHit = null;
  let what = 'none';
  let prev = 0;
  for (let t = dt; t <= tMax; t += dt) {
    const g = inside(t);
    const hitNow = Object.entries(g).find(([, v]) => v >= 0);
    if (hitNow) {
      const key = hitNow[0];
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        if (inside(mid)[key] >= 0) hi = mid;
        else lo = mid;
      }
      tHit = 0.5 * (lo + hi);
      what = key;
      break;
    }
    prev = t;
  }
  const tEnd = tHit ?? tMax;
  const pts = [];
  for (let i = 0; i <= samples; i++) pts.push({ t: (tEnd * i) / samples, ...stateAt((tEnd * i) / samples, P0, V, w) });
  const end = stateAt(tEnd, P0, V, w);
  return { P0, V, tHit, what, pts, end, speedInertial: Math.hypot(V.x, V.y) };
}

/**
 * Точное решение для кольца: предмет отпущен из покоя на высоте h над полом радиуса R.
 * φ = arccos((R − h)/R), время t = tg φ / ω, отставание по дуге пола s = R·(tg φ − φ).
 */
export function ringDropExact(R, h, w) {
  const phi = Math.acos((R - h) / R);
  return { t: Math.tan(phi) / w, arc: R * (Math.tan(phi) - phi) };
}

/** Малые высоты: s ≈ R·(2h/R)^{3/2}/3 — то же, что «земная» формула ω·g·t³/3. */
export function smallDropDeflection(R, h) {
  return (R * Math.pow((2 * h) / R, 1.5)) / 3;
}

/**
 * Точное решение для плоской палубы, предмет из покоя в точке y = 0:
 * при θ = ωt координаты x = r0·(cos θ + θ·sin θ), y = r0·(θ·cos θ − sin θ).
 * Ищем θ, при котором x = floorR.
 */
export function flatDropExact(floorR, h, w) {
  const r0 = floorR - h;
  const f = (th) => r0 * (Math.cos(th) + th * Math.sin(th)) - floorR;
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) >= 0) hi = mid;
    else lo = mid;
  }
  const th = 0.5 * (lo + hi);
  return { t: th / w, y: r0 * (th * Math.cos(th) - Math.sin(th)) };
}
