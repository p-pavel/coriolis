// Константы Земли и удобные точки старта. СИ, сферическая Земля (упрощение, подписано на сайте).

/** Гравитационный параметр Земли μ = GM, м³/с² (EGM96 / стандарт WGS-ish для задач такого класса). */
export const MU_EARTH = 3.986004418e14;

/** Средний радиус Земли, м. */
export const R_EARTH = 6371e3;

/** Угловая скорость вращения Земли (сидерическая), рад/с. */
export const OMEGA_EARTH = 7.292115e-5;

/** Длительность сидерических суток, с. */
export const SIDEREAL_DAY = (2 * Math.PI) / OMEGA_EARTH;

/** Стандартное g₀, м/с² (для подписей перегрузок на разгоне). */
export const G0 = 9.80665;

/** Геосинхронный радиус (круговая орбита с периодом = сидерические сутки), м. */
export const R_GEO = Math.cbrt((MU_EARTH * SIDEREAL_DAY * SIDEREAL_DAY) / (4 * Math.PI * Math.PI));

export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** Известные космодромы для пресетов UI. */
/** Высота кругового GEO над поверхностью, м. */
export const H_GEO = R_GEO - R_EARTH;

export const SITES = {
  baikonur: { name: 'Байконур', lat: rad(45.965), lon: rad(63.305) },
  plesetsk: { name: 'Плесецк', lat: rad(62.927), lon: rad(40.575) },
  vostochny: { name: 'Восточный', lat: rad(51.884), lon: rad(128.334) },
  kourou: { name: 'Куру', lat: rad(5.232), lon: rad(-52.769) },
  kennedy: { name: 'Кеннеди', lat: rad(28.392), lon: rad(-80.608) },
  equator: { name: 'Экватор (0°, 0°)', lat: 0, lon: 0 },
};
