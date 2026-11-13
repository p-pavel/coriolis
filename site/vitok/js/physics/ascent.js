// Упрощённый этап выведения на круговую НОО.
//
// Модель (оценки, не баллистика конкретной ракеты):
//  • старт с поверхности; азимут из (φ, i);
//  • за время T_asc высота растёт 0→h, скорость — до круговой;
//  • траектория в плоскости орбиты: аргумент широты u идёт от u_launch до u_ins;
//  • Земля за это время поворачивается на ω_E·T_asc — сдвиг долготы вставки.
// Не учитываем: атмосферу, гравитёрн по ТЗ ракеты, потери на управление, J2.

import { R_EARTH, OMEGA_EARTH, MU_EARTH, G0 } from './constants.js';
import { circularSpeed, launchAzimuth, eciOnCircular, eciToLatLonInertial, geographicLon } from './orbit.js';

/**
 * Аргумент широты в момент, когда широта = φ при наклонении i.
 * sin φ = sin i · sin u  ⇒  u = arcsin(sin φ / sin i) (восходящая ветвь).
 */
export function argLatAtLatitude(lat, i) {
  const s = Math.sin(lat) / Math.sin(i);
  if (Math.abs(s) > 1 + 1e-9) return null;
  return Math.asin(Math.max(-1, Math.min(1, s)));
}

/**
 * Собрать миссию выведения + круговую НОО.
 *
 * @param {{ lat0, lon0, h, i, Tasc, theta0? }} p
 *   lat0, lon0 — старт (рад); h — высота круговой НОО (м);
 *   i — наклонение (рад); Tasc — длительность разгона (с);
 *   theta0 — угол Гринвича в t=0 (рад), по умолчанию так, что старт на λ=lon0.
 */
export function buildMission(p) {
  const { lat0, lon0, h, i, Tasc } = p;
  const r = R_EARTH + h;
  if (Math.abs(i) + 1e-12 < Math.abs(lat0)) {
    return { ok: false, reason: 'inclination_below_latitude' };
  }
  const Az = launchAzimuth(lat0, i);
  if (Az == null) {
    return { ok: false, reason: 'inclination_below_latitude' };
  }
  const u0 = argLatAtLatitude(lat0, i);
  if (u0 == null) {
    return { ok: false, reason: 'inclination_below_latitude' };
  }

  // За разгон проходим «вниз по трассе» долю орбиты: оценка — догоняем круговую
  // скорость, проходя дугу ~ (v_circ / r) * Tasc / 2 в среднем. Берём явно:
  // u растёт линейно на Δu = (Tasc / T_orb) * 2π * k_coast, с k≈0.35 (типичный
  // порядок: за ~8–10 мин LEO-выведения — десятки градусов по аргументу широты).
  const Torb = 2 * Math.PI * Math.sqrt((r * r * r) / MU_EARTH);
  const duAsc = Math.min(1.2, (Tasc / Torb) * 2 * Math.PI * 0.45);
  const uIns = u0 + duAsc;

  // θ_earth(0): в t=0 ракета на старте — географическая долгота lon0.
  // Инерциальная долгота старта = atan2(y,x) при u=u0, Ω пока неизвестна.
  // Выбираем Ω так, чтобы в t=0 подспутниковая точка = (lat0, lon0).
  const theta0 = p.theta0 ?? 0;
  const Omega = solveOmegaForSite(lat0, lon0, i, u0, theta0);

  const vCirc = circularSpeed(r);
  // Оценка Δv только порядка величины для НОО (не Hohmann/GEO): круговая − бонус
  // вращения + грубые гравит. потери. Для h ≳ 2000 км число обманчиво — в UI не как факт.
  const vRot = OMEGA_EARTH * R_EARTH * Math.cos(lat0) * Math.sin(Az);
  const dVapprox = vCirc - vRot + G0 * Tasc * 0.35;
  const dVtrustworthy = h < 2000e3;

  return {
    ok: true,
    lat0,
    lon0,
    h,
    r,
    i,
    Az,
    u0,
    uIns,
    Omega,
    theta0,
    Tasc,
    Torb,
    vCirc,
    vRot,
    dVapprox,
    dVtrustworthy,
    duAsc,
  };
}

/** Ω из условия: при u=u0, θ=θ0 географическая точка = (lat, lon). */
function solveOmegaForSite(lat, lon, i, u, theta0) {
  // Широта уже согласована через u; подбираем Ω по долготе.
  // λ_geo = λ_inertial(Ω,u,i) − θ0 = lon  ⇒  λ_inertial = lon + θ0.
  const target = lon + theta0;
  // Из eci: x+iy ∝ e^{iΩ} * (cos u − i cos i sin u) в комплексной форме...
  // lon_inertial = atan2(y,x) = Ω + atan2(sin u · cos i, cos u)  (для стандартного вращения)
  const lonOfNode = Math.atan2(Math.sin(u) * Math.cos(i), Math.cos(u));
  return target - lonOfNode;
}

/**
 * Точка траектории: фаза 'ascent' | 'orbit', время от старта t.
 * Возвращает { lat, lon, r, u, phase }.
 */
export function stateAt(mission, t) {
  const m = mission;
  const theta = m.theta0 + OMEGA_EARTH * t;
  if (t < m.Tasc) {
    const s = t / m.Tasc;
    // Высота ~ s² (медленный старт), u линейно, «орбитальный» радиус растёт.
    const alt = m.h * s * s;
    const r = R_EARTH + alt;
    const u = m.u0 + m.duAsc * s;
    const p = eciOnCircular(r, m.i, m.Omega, u);
    const { lat, lon: lonI } = eciToLatLonInertial(p.x, p.y, p.z);
    return { lat, lon: geographicLon(lonI, theta), r, u, phase: 'ascent', t };
  }
  const tOrb = t - m.Tasc;
  const u = m.uIns + (2 * Math.PI * tOrb) / m.Torb;
  const p = eciOnCircular(m.r, m.i, m.Omega, u);
  const { lat, lon: lonI } = eciToLatLonInertial(p.x, p.y, p.z);
  return { lat, lon: geographicLon(lonI, theta), r: m.r, u, phase: 'orbit', t };
}

/**
 * Выборка траектории: разгон семплируется отдельно (иначе при GEO/сутках
 * равномерная сетка съедает весь подъём в 0–1 точку).
 */
export function sampleTrack(mission, tEnd, n = 400) {
  const out = [];
  const Tasc = Math.min(mission.Tasc, tEnd);
  const nAsc = Tasc > 0 ? Math.max(24, Math.round(n * 0.15)) : 0;
  const nOrb = Math.max(n - nAsc, 32);
  for (let k = 0; k <= nAsc; k++) {
    const t = nAsc === 0 ? 0 : (Tasc * k) / nAsc;
    if (t <= tEnd) out.push(stateAt(mission, t));
  }
  if (tEnd > Tasc) {
    for (let k = 1; k <= nOrb; k++) {
      const t = Tasc + ((tEnd - Tasc) * k) / nOrb;
      out.push(stateAt(mission, t));
    }
  }
  return out;
}
