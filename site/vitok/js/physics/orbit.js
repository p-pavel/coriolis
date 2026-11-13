// Кеплерова круговая орбита вокруг сферической Земли (без J2).

import { MU_EARTH, R_EARTH, OMEGA_EARTH, SIDEREAL_DAY } from './constants.js';

/** Период круговой орбиты радиуса r (от центра Земли), с. */
export function periodCircular(r) {
  return 2 * Math.PI * Math.sqrt((r * r * r) / MU_EARTH);
}

/** Радиус круговой орбиты с заданным периодом, м. */
export function radiusFromPeriod(T) {
  return Math.cbrt((MU_EARTH * T * T) / (4 * Math.PI * Math.PI));
}

/** Высота над поверхностью → радиус. */
export function radiusFromAltitude(h) {
  return R_EARTH + h;
}

export function altitudeFromRadius(r) {
  return r - R_EARTH;
}

/** Круговая скорость, м/с. */
export function circularSpeed(r) {
  return Math.sqrt(MU_EARTH / r);
}

/**
 * Азимут пуска от севера по часовой (рад) для заданных широты старта и наклонения.
 * Формула: cos i = cos φ · sin Az  ⇒  sin Az = cos i / cos φ.
 * При |i| < |φ| решения нет (орбита не проходит над стартом).
 */
export function launchAzimuth(lat, i) {
  const s = Math.cos(i) / Math.cos(lat);
  if (Math.abs(s) > 1 + 1e-12) return null;
  const clamped = Math.max(-1, Math.min(1, s));
  // Два решения: Az и π−Az; берём восточное (Az ∈ (0, π)) — меньший расход на широте.
  return Math.asin(clamped);
}

/** Минимальное наклонение, достижимое с широты φ без смены плоскости: |φ|. */
export function minInclination(lat) {
  return Math.abs(lat);
}

/**
 * Сдвиг географической долготы подспутниковой точки за один виток
 * (круговая орбита, без прецессии узла): Земля успевает повернуться на ω_E · T.
 * Для прямого движения след «уезжает» на запад: Δλ = −ω_E · T (рад, (−π, π]).
 */
export function longitudeShiftPerOrbit(T) {
  const twopi = 2 * Math.PI;
  let d = -OMEGA_EARTH * T;
  d = d - twopi * Math.round(d / twopi);
  if (d > Math.PI) d -= twopi;
  if (d <= -Math.PI) d += twopi;
  return d;
}

/** Критерий «один виток → та же долгота»: |T − T_sid| / T_sid мало. */
export function oneOrbitReturns(T, relTol = 0.02) {
  return Math.abs(T - SIDEREAL_DAY) / SIDEREAL_DAY <= relTol;
}

/**
 * Положение на круговой орбите в ECI.
 * Ω — долгота восходящего узла (инерциальная), i — наклонение, u — аргумент широты.
 */
export function eciOnCircular(r, i, Omega, u) {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const ci = Math.cos(i);
  const si = Math.sin(i);
  const cO = Math.cos(Omega);
  const sO = Math.sin(Omega);
  // r_pqw = r (cos u, sin u, 0); затем R3(Ω) R1(i)
  const x = r * (cO * cu - sO * su * ci);
  const y = r * (sO * cu + cO * su * ci);
  const z = r * (su * si);
  return { x, y, z };
}

/** ECI → геоцентрическая широта и инерциальная долгота. */
export function eciToLatLonInertial(x, y, z) {
  const r = Math.hypot(x, y, z);
  const lat = Math.asin(z / r);
  const lon = Math.atan2(y, x);
  return { lat, lon, r };
}

/**
 * Географическая долгота: из инерциальной вычитаем угол поворота Земли.
 * θ(t) = θ0 + ω_E t; λ = λ_inertial − θ.
 */
export function geographicLon(lonInertial, thetaEarth) {
  const twopi = 2 * Math.PI;
  let lam = lonInertial - thetaEarth;
  lam = lam - twopi * Math.round(lam / twopi);
  if (lam > Math.PI) lam -= twopi;
  if (lam <= -Math.PI) lam += twopi;
  return lam;
}
