// Подспутниковая точка: «один виток» vs возврат после N витков (повторяющаяся трасса).

import { OMEGA_EARTH, SIDEREAL_DAY, R_EARTH } from './constants.js';
import {
  longitudeShiftPerOrbit,
  periodCircular,
  oneOrbitReturns,
  radiusFromPeriod,
  altitudeFromRadius,
} from './orbit.js';
import { stateAt } from './ascent.js';

/** В (−π, π]; кратные ±2π дают 0. */
export function wrapPi(a) {
  const twopi = 2 * Math.PI;
  let x = a - twopi * Math.round(a / twopi);
  if (x > Math.PI) x -= twopi;
  if (x <= -Math.PI) x += twopi;
  return x;
}

function haversine(lat1, lon1, lat2, lon2, R) {
  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;
  const s =
    Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Ближайшее N≥1 с |N·Δλ| mod 2π < tol.
 * Для произвольной высоты может быть большим; для урока чаще берут round(T_sid/T).
 */
export function orbitsToCloseLongitude(dLon, tolDeg = 0.5, maxN = 400) {
  const tol = (tolDeg * Math.PI) / 180;
  for (let n = 1; n <= maxN; n++) {
    if (Math.abs(wrapPi(dLon * n)) < tol) return n;
  }
  return null;
}

/** N ≈ T_sid/T — «витков за сутки»; residual — остаток по долготе (рад). */
export function orbitsPerSiderealDay(T) {
  const nFloat = SIDEREAL_DAY / T;
  const n = Math.max(1, Math.round(nFloat));
  const dLon = longitudeShiftPerOrbit(T);
  return {
    nFloat,
    n,
    residualDeg: (wrapPi(dLon * n) * 180) / Math.PI,
    time: n * T,
  };
}

/**
 * Период и высота круговой орбиты, на которой долгота замыкается ровно за N витков:
 * N·ω_E·T = 2π  ⇒  T = T_sid / N.
 */
export function circularForRepeatOrbits(N) {
  if (N < 1) throw new Error('N≥1');
  const T = SIDEREAL_DAY / N;
  const r = radiusFromPeriod(T);
  return { N, T, r, h: altitudeFromRadius(r) };
}

/**
 * Момент, когда на орбите снова аргумент широты = u0 (фаза старта),
 * после как минимум N полных оборотов от вставки.
 * t = Tasc + N·Torb − (duAsc/(2π))·Torb
 */
export function timeAtLaunchPhase(mission, N) {
  const frac = mission.duAsc / (2 * Math.PI);
  return mission.Tasc + N * mission.Torb - frac * mission.Torb;
}

/**
 * Кратчайшее расстояние подспутниковой точки до старта на участке орбиты
 * [Tasc, Tasc + orbits·T] — без t=0 на стартовой площадке (там всегда 0).
 * «Первый–полуторный виток» ≈ orbits=1.5.
 */
export function closestApproachOnOrbit(mission, orbits = 1.5, nSamples = 900) {
  const { Tasc, Torb, lat0, lon0 } = mission;
  const t0 = Tasc;
  const t1 = Tasc + orbits * Torb;
  let best = null;
  for (let k = 0; k <= nSamples; k++) {
    const t = t0 + ((t1 - t0) * k) / nSamples;
    const s = stateAt(mission, t);
    const missKm = haversine(lat0, lon0, s.lat, s.lon, R_EARTH) / 1000;
    if (!best || missKm < best.missKm) {
      best = {
        missKm,
        t,
        lat: s.lat,
        lon: s.lon,
        orbitsFromInsert: (t - Tasc) / Torb,
      };
    }
  }
  return best;
}

/**
 * Сводка. Важно: «промах после N витков у точки вставки» ≠ «промах над стартом».
 * Для старта смотрим фазу u=u0; плюс closestOnFirstOrbit — min по дуге ~1,5 витка.
 */
export function closureReport(mission) {
  const { Torb, lat0, lon0, Tasc, duAsc } = mission;
  const dLon = longitudeShiftPerOrbit(Torb);
  const returnsOne = oneOrbitReturns(Torb);
  const perDay = orbitsPerSiderealDay(Torb);

  // Через один виток после вставки — та же фаза, что у вставки (не старт).
  const t1ins = Tasc + Torb;
  const s1ins = stateAt(mission, t1ins);
  const afterOneAtInsertion = {
    lat: s1ins.lat,
    lon: s1ins.lon,
    dLon: wrapPi(s1ins.lon - lon0),
    missKm: haversine(lat0, lon0, s1ins.lat, s1ins.lon, R_EARTH) / 1000,
  };

  // Через ~один виток в фазе старта (u=u0): честный «где мы относительно старта».
  const t1 = timeAtLaunchPhase(mission, 1);
  const s1 = stateAt(mission, Math.max(t1, Tasc));
  const afterOneOrbit = {
    lat: s1.lat,
    lon: s1.lon,
    dLon: wrapPi(s1.lon - lon0),
    dLat: s1.lat - lat0,
    missKm: haversine(lat0, lon0, s1.lat, s1.lon, R_EARTH) / 1000,
    t: Math.max(t1, Tasc),
  };

  const closest15 = closestApproachOnOrbit(mission, 1.5);

  const nClose = perDay.n; // учебный N: round(T_sid/T); точный резонанс — пресеты
  const tN = timeAtLaunchPhase(mission, nClose);
  const sN = stateAt(mission, Math.max(tN, Tasc));
  const afterN = {
    n: nClose,
    lat: sN.lat,
    lon: sN.lon,
    dLon: wrapPi(sN.lon - lon0),
    dLat: sN.lat - lat0,
    missKm: haversine(lat0, lon0, sN.lat, sN.lon, R_EARTH) / 1000,
    t: Math.max(tN, Tasc),
    residualDeg: perDay.residualDeg,
  };

  return {
    Torb,
    dLonPerOrbit: dLon,
    dLonPerOrbitDeg: (dLon * 180) / Math.PI,
    returnsAfterOneOrbit: returnsOne,
    afterOneOrbit,
    afterOneAtInsertion,
    closestOnFirstOrbit: closest15,
    ascentDownrangeDeg: (duAsc * 180) / Math.PI,
    orbitsToLonRepeat: nClose,
    orbitsPerDayFloat: perDay.nFloat,
    timeToLonRepeat: afterN.t - Tasc,
    afterNOrbits: afterN,
    siderealDay: SIDEREAL_DAY,
    earthTurnPerOrbitDeg: (OMEGA_EARTH * Torb * 180) / Math.PI,
    periodVsSidereal: Torb / SIDEREAL_DAY,
  };
}

export { periodCircular, longitudeShiftPerOrbit, haversine };
