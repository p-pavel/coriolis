// Проверки: формула ↔ независимый численный расчёт (НЕ сама с собой).

import { MU_EARTH, R_EARTH, OMEGA_EARTH, SIDEREAL_DAY, R_GEO, rad, SITES } from './constants.js';
import {
  periodCircular,
  radiusFromPeriod,
  circularSpeed,
  launchAzimuth,
  longitudeShiftPerOrbit,
  eciOnCircular,
  eciToLatLonInertial,
  geographicLon,
  oneOrbitReturns,
} from './orbit.js';
import { buildMission, stateAt, argLatAtLatitude } from './ascent.js';
import { closureReport, circularForRepeatOrbits, orbitsToCloseLongitude } from './groundtrack.js';

function relErr(got, exp) {
  const e = Math.abs(exp);
  return e < 1e-15 ? Math.abs(got - exp) : Math.abs(got - exp) / e;
}

function pass(got, expected, tol, note) {
  const err = relErr(got, expected);
  return { pass: err <= tol, got, expected, err, tol, note };
}

function passAbs(got, expected, tol, note) {
  const err = Math.abs(got - expected);
  return { pass: err <= tol, got, expected, err, tol, note };
}

export const CHECKS = [
  {
    id: 'period',
    title: 'Период круговой орбиты T = 2π√(r³/μ)',
    run() {
      const r = R_EARTH + 400e3;
      const T = periodCircular(r);
      // Независимо: интегрируем угловую скорость ω = √(μ/r³) за период → 2π.
      const w = Math.sqrt(MU_EARTH / (r * r * r));
      const angle = w * T;
      return passAbs(angle, 2 * Math.PI, 1e-12, `T=${T.toFixed(3)} с при h=400 км`);
    },
  },
  {
    id: 'geo-radius',
    title: 'Радиус геосинхронной орбиты из T = T_sid',
    run() {
      const r = radiusFromPeriod(SIDEREAL_DAY);
      return pass(r, R_GEO, 1e-12, `R_GEO=${(R_GEO / 1e3).toFixed(1)} км`);
    },
  },
  {
    id: 'vcirc',
    title: 'Круговая скорость v = √(μ/r)',
    run() {
      const r = R_EARTH + 400e3;
      const v = circularSpeed(r);
      // Независимо из центростремительного: v²/r = μ/r².
      const a = (v * v) / r;
      const g = MU_EARTH / (r * r);
      return pass(a, g, 1e-12, `v=${v.toFixed(1)} м/с`);
    },
  },
  {
    id: 'azimuth-east',
    title: 'Пуск на восток с широты φ → i = |φ|',
    run() {
      const lat = SITES.baikonur.lat;
      const i = Math.abs(lat);
      const Az = launchAzimuth(lat, i);
      return passAbs(Az, Math.PI / 2, 1e-9, 'Az = 90°');
    },
  },
  {
    id: 'azimuth-impossible',
    title: 'Наклонение меньше широты старта — азимута нет',
    run() {
      const Az = launchAzimuth(rad(46), rad(30));
      return { pass: Az == null, got: Az, expected: null, err: 0, tol: 0, note: 'i < |φ|' };
    },
  },
  {
    id: 'arglat',
    title: 'sin φ = sin i · sin u на трассе',
    run() {
      const i = rad(51.6);
      const lat = rad(45.965);
      const u = argLatAtLatitude(lat, i);
      const lat2 = Math.asin(Math.sin(i) * Math.sin(u));
      return passAbs(lat2, lat, 1e-12, `u=${((u * 180) / Math.PI).toFixed(2)}°`);
    },
  },
  {
    id: 'dlon-leo',
    title: 'Сдвиг долготы за виток НОО ≈ −ω_E·T (~−22° при 90 мин)',
    run() {
      const T = 90 * 60;
      const d = longitudeShiftPerOrbit(T);
      const exp = -OMEGA_EARTH * T;
      // wrap
      let e = exp;
      while (e <= -Math.PI) e += 2 * Math.PI;
      while (e > Math.PI) e -= 2 * Math.PI;
      return passAbs(d, e, 1e-12, `Δλ=${((d * 180) / Math.PI).toFixed(2)}°`);
    },
  },
  {
    id: 'one-orbit-leo',
    title: 'НОО ~90 мин: за один виток в старт НЕ возвращаемся',
    run() {
      const m = buildMission({
        lat0: SITES.baikonur.lat,
        lon0: SITES.baikonur.lon,
        h: 400e3,
        i: rad(51.6),
        Tasc: 600,
      });
      const rep = closureReport(m);
      // Главный урок — сдвиг долготы ~22°; промах в фазе старта — тысячи км.
      const ok =
        !rep.returnsAfterOneOrbit &&
        Math.abs(rep.dLonPerOrbitDeg) > 20 &&
        rep.afterOneOrbit.missKm > 1000;
      return {
        pass: ok,
        got: rep.afterOneOrbit.missKm,
        expected: '>1000 км и |Δλ|>20°',
        err: 0,
        tol: 0,
        note: `промах(фаза старта) ${rep.afterOneOrbit.missKm.toFixed(0)} км, Δλ=${rep.dLonPerOrbitDeg.toFixed(1)}°`,
      };
    },
  },
  {
    id: 'repeat-phase',
    title: 'Резонанс N=15: в фазе старта промах мал (не путать с фазой вставки)',
    run() {
      const { h } = circularForRepeatOrbits(15);
      const m = buildMission({
        lat0: SITES.baikonur.lat,
        lon0: SITES.baikonur.lon,
        h,
        i: rad(51.6),
        Tasc: 600,
      });
      const rep = closureReport(m);
      const ok = rep.afterNOrbits.n === 15 && rep.afterNOrbits.missKm < 200;
      return {
        pass: ok,
        got: rep.afterNOrbits.missKm,
        expected: '<200 км',
        err: 0,
        tol: 0,
        note: `вставка дала бы ~${rep.afterOneAtInsertion.missKm.toFixed(0)} км из‑за duAsc`,
      };
    },
  },
  {
    id: 'one-orbit-geo',
    title: 'Период = T_sid: критерий «один виток» выполняется (не НОО)',
    run() {
      const ok = oneOrbitReturns(SIDEREAL_DAY, 1e-9);
      const d = longitudeShiftPerOrbit(SIDEREAL_DAY);
      return passAbs(d, 0, 1e-9, `проверка для справки, |Δλ|=${Math.abs(d)}`);
    },
  },
  {
    id: 'earth-rot-boost',
    title: 'Линейная скорость Земли на широте Байконура',
    run() {
      const lat = SITES.baikonur.lat;
      const v = OMEGA_EARTH * R_EARTH * Math.cos(lat);
      // Независимо: длина параллели / сидерические сутки.
      const circ = 2 * Math.PI * R_EARTH * Math.cos(lat);
      const v2 = circ / SIDEREAL_DAY;
      return pass(v, v2, 1e-12, `v=${v.toFixed(1)} м/с`);
    },
  },
  {
    id: 'geo-lon-wrap',
    title: 'Географическая долгота = инерциальная − ω_E t',
    run() {
      const lonI = rad(100);
      const t = 3600;
      const theta = OMEGA_EARTH * t;
      const lon = geographicLon(lonI, theta);
      // Численно: из ECI точки на экваторе.
      const r = R_EARTH + 400e3;
      const p = eciOnCircular(r, 0, lonI, 0);
      const { lon: lonI2 } = eciToLatLonInertial(p.x, p.y, p.z);
      const lon2 = geographicLon(lonI2, theta);
      return passAbs(lon, lon2, 1e-9, `λ=${((lon * 180) / Math.PI).toFixed(2)}°`);
    },
  },
  {
    id: 'track-continuity',
    title: 'Трек: в момент выхода на орбиту высота = h',
    run() {
      const m = buildMission({
        lat0: SITES.baikonur.lat,
        lon0: SITES.baikonur.lon,
        h: 300e3,
        i: rad(51.6),
        Tasc: 480,
      });
      const s = stateAt(m, m.Tasc);
      return passAbs(s.r, m.r, 1, `phase=${s.phase}`);
    },
  },
  {
    id: 'repeat-N',
    title: 'T = T_sid/N ⇒ долгота замыкается за N витков (пример N=3)',
    run() {
      const { T, N } = circularForRepeatOrbits(3);
      const d = longitudeShiftPerOrbit(T);
      const n = orbitsToCloseLongitude(d, 0.05);
      return {
        pass: n === N,
        got: n,
        expected: N,
        err: n === N ? 0 : 1,
        tol: 0,
        note: `N=3, T=${(T / 3600).toFixed(3)} ч, Δλ=${((d * 180) / Math.PI).toFixed(2)}°`,
      };
    },
  },
  {
    id: 'repeat-geo',
    title: 'N=1: геосинхрон — один виток замыкает долготу',
    run() {
      const geo = circularForRepeatOrbits(1);
      const d = longitudeShiftPerOrbit(geo.T);
      const n = orbitsToCloseLongitude(d, 0.05);
      const ok = n === 1 && Math.abs(geo.T - SIDEREAL_DAY) / SIDEREAL_DAY < 1e-12;
      return {
        pass: ok,
        got: n,
        expected: 1,
        err: ok ? 0 : 1,
        tol: 0,
        note: `h=${(geo.h / 1e3).toFixed(0)} км, |Δλ|=${((Math.abs(d) * 180) / Math.PI).toFixed(4)}°`,
      };
    },
  },
];

export function runAll() {
  return CHECKS.map((c) => {
    const t0 = performance.now();
    let r;
    try {
      r = c.run();
    } catch (e) {
      r = { pass: false, got: String(e), expected: 'no throw', err: 1, tol: 0, error: String(e) };
    }
    return { id: c.id, title: c.title, ms: performance.now() - t0, ...r };
  });
}
