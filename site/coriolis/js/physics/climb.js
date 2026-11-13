// «Переползти между кораблями»: человек или кабина движется вдоль троса
// от одного корабля через ось вращения к другому.
//
// Вращающаяся СО (ось x — вдоль троса, y — по направлению вращения), трос жёсткий,
// ω постоянна. Чтобы двигаться по закону x(t), руки (или привод кабины) должны
// прикладывать силу F = m·(a_отн + ω×(ω×r) + 2·ω×v):
//   вдоль троса:   F_x = m·(ẍ − ω²·x)
//   поперёк троса: F_y = 2·m·ω·ẋ           (сила Кориолиса, которую надо уравновесить)
// Работа против «веса» от радиуса R до x: W = m·ω²·(R² − x²)/2.

/** Трапециевидный профиль скорости: разгон с amax до vmax, движение, торможение. Путь L. */
export function trapezoid(L, vmax, amax) {
  let ta = vmax / amax;
  let v = vmax;
  if (amax * ta * ta > L) {
    ta = Math.sqrt(L / amax);
    v = amax * ta;
  }
  const sa = 0.5 * amax * ta * ta;
  const tc = (L - 2 * sa) / v;
  const T = 2 * ta + tc;
  const at = (t) => {
    if (t <= 0) return { s: 0, v: 0, a: 0 };
    if (t < ta) return { s: 0.5 * amax * t * t, v: amax * t, a: amax };
    if (t < ta + tc) return { s: sa + v * (t - ta), v, a: 0 };
    if (t < T) {
      const r = T - t;
      return { s: L - 0.5 * amax * r * r, v: amax * r, a: -amax };
    }
    return { s: L, v: 0, a: 0 };
  };
  return { T, at, vPeak: v };
}

/** Силы, которые должен прикладывать движущийся по тросу груз массы m (Н). */
export function climbForces(x, xd, xdd, w, m) {
  return { along: m * (xdd - w * w * x), across: 2 * m * w * xd };
}

/**
 * Полный расчёт перехода с корабля на корабль: от x = +R до x = −R.
 * Isys — момент инерции системы без груза; изменение ω из сохранения момента импульса.
 */
export function crossing({ R, w, m, vmax, amax, Isys, Ttether, n = 600 }) {
  const prof = trapezoid(2 * R, vmax, amax);
  const L = (Isys + m * R * R) * w;
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const t = (prof.T * i) / n;
    const st = prof.at(t);
    const x = R - st.s;
    const xd = -st.v;
    const xdd = -st.a;
    const F = climbForces(x, xd, xdd, w, m);
    const wNow = L / (Isys + m * x * x);
    // прогиб натянутой струны под поперечной сосредоточенной силой
    const span = 2 * R;
    const pos = R - x;
    const sag = (Math.abs(F.across) * pos * (span - pos)) / (Ttether * span);
    rows.push({ t, x, v: st.v, a: st.a, along: F.along, across: F.across, w: wNow, sag });
  }
  const work = 0.5 * m * w * w * R * R;
  return { prof, rows, work, wCenter: L / Isys };
}

/**
 * Проверочная функция: ускорение точки, движущейся вдоль вращающегося стержня,
 * найденное численным дифференцированием её инерциальной траектории.
 */
export function inertialAccelFD(xOf, w, t, h = 1e-3) {
  const pos = (tt) => {
    const x = xOf(tt);
    return [x * Math.cos(w * tt), x * Math.sin(w * tt)];
  };
  const p0 = pos(t - h);
  const p1 = pos(t);
  const p2 = pos(t + h);
  const ax = (p2[0] - 2 * p1[0] + p0[0]) / (h * h);
  const ay = (p2[1] - 2 * p1[1] + p0[1]) / (h * h);
  // перевод во вращающиеся оси в момент t
  const c = Math.cos(w * t);
  const s = Math.sin(w * t);
  return { along: ax * c + ay * s, across: -ax * s + ay * c };
}
