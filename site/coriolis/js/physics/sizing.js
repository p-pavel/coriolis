// Аналитические расчёты: трос двух кораблей, кольцо, комфорт, моды качания, прецессия.
// Вывод формул — на странице physics.html; каждая формула сверяется
// с численной моделью в checks.js.

import { G0, rpmToOmega } from './constants.js';

/**
 * Частоты качания кораблей (тангаж в плоскости вращения) для системы
 * «два одинаковых корабля на невесомом нерастяжимом тросе».
 * M, I — масса и момент инерции корабля относительно его центра масс;
 * a — расстояние нос→ЦМ; Ra — расстояние от оси до носа; w — скорость вращения.
 * Симметричная мода (оба корабля поворачиваются в одну сторону, трос доворачивается):
 *   Ω² = ω²·a·(M·Rcm² + I) / (I·Ra)
 * Антисимметричная мода (корабли поворачиваются навстречу, середина троса смещается вбок):
 *   Ω² = ω²·M·Rcm·a / I
 */
export function pitchModes({ M, I, a, Ra, w }) {
  const Rcm = Ra + a;
  return {
    sym: w * Math.sqrt((a * (M * Rcm * Rcm + I)) / (I * Ra)),
    anti: w * Math.sqrt((M * Rcm * a) / I),
  };
}

/**
 * Скорость прецессии оси вращения под действием гравитационного градиента
 * на круговой орбите (усреднение по орбите и по вращению, ω ≫ n).
 * Для гантели и для тонкого кольца (I_осевой − I_попер)/I_осевой = 1/2, поэтому
 *   Ω_p = (3/4)·(n²/ω)·cos β, прецессия обратная (против орбитального движения).
 */
export function spinAxisPrecession({ n, w, beta = 0, inertiaRatio = 0.5 }) {
  return -1.5 * ((n * n) / w) * inertiaRatio * Math.cos(beta);
}

/**
 * Продольные колебания («подпрыгивание»): половина троса — пружина жёсткости EA/l0
 * (l0 — длина половины троса без нагрузки), груз M на конце, поправка Рэлея на массу
 * троса (m_троса/6 — треть массы половины троса) и центробежная добавка 3ω².
 */
export function bounceOmega({ EA, l0, M, mTether, w }) {
  return Math.sqrt(EA / l0 / (M + mTether / 6) + 3 * w * w);
}

/** Зоны комфорта по скорости вращения (Hall; Globus & Hall 2017). */
export function comfortZone(rpm) {
  if (rpm <= 2) return { level: 0, text: 'комфортно почти для всех' };
  if (rpm <= 4) return { level: 1, text: 'нужна адаптация (часы–дни), большинство привыкает' };
  if (rpm <= 6) return { level: 2, text: 'тяжело: укачивание, адаптируются не все' };
  return { level: 3, text: 'за пределами разумной зоны' };
}

/**
 * Два корабля висят носами к центру на общем тросе постоянного сечения.
 * Задаём ощущаемую тяжесть на полу жилой палубы и скорость вращения.
 *
 * Натяжение троса на расстоянии x от оси (ρA — погонная масса):
 *   T(x) = Ta + ρA·ω²·(Ra² − x²)/2,  Ta = M·ω²·Rcm — нагрузка от корабля.
 * Максимум — на оси: T0 = Ta + ρA·ω²·Ra²/2. Сечение по допускаемому напряжению
 * σ_доп = η·σ/n (η — реализация прочности в канате, n — запас):
 *   A = Ta / (σ_доп − ρ·ω²·Ra²/2).
 * Решение существует, только если ρ·v_носа²/2 < σ_доп («трос держит сам себя»).
 */
export function designTether(p) {
  const { M, gDeck, rpm, deckFromNose, cmFromNose, gyration, mat, SF, eta, halfWidth = 4.5 } = p;
  const w = rpmToOmega(rpm);
  const rDeck = (gDeck * G0) / (w * w);
  const Ra = rDeck - deckFromNose;
  const Rcm = Ra + cmFromNose;
  const base = { w, rpm, rDeck, Ra, Rcm, vRim: w * Rcm, comfort: comfortZone(rpm) };
  if (Ra < 2) {
    return {
      ...base,
      ok: false,
      reason:
        'Радиус слишком мал: при такой скорости вращения пол палубы должен быть ближе к оси, чем нос корабля. Уменьшите обороты.',
    };
  }
  const Ta = M * w * w * Rcm;
  const sAllow = (eta * mat.sigma) / SF;
  const sSelf = (mat.rho * w * w * Ra * Ra) / 2;
  if (sSelf >= sAllow) {
    return {
      ...base,
      ok: false,
      Ta,
      reason: 'Трос не выдерживает даже собственную массу: ρ·ω²·R²/2 ≥ σ_доп. Нужен более прочный материал или меньший радиус.',
    };
  }
  const A = Ta / (sAllow - sSelf);
  const rhoA = mat.rho * A;
  const EA = mat.E * A;
  const T0 = Ta + (rhoA * w * w * Ra * Ra) / 2;
  const mTether = 2 * rhoA * Ra;
  // l0 = ∫dx/(1 + T/EA) с T = T0 − b·x²: точный интеграл через atanh
  const K = EA + T0;
  const z = Ra * Math.sqrt((rhoA * w * w) / 2 / K);
  const stretchHalf = Ra - ((EA * Ra) / K) * (z > 1e-8 ? Math.atanh(z) / z : 1);
  const I = M * gyration * gyration;
  const Tmean = Ta + (rhoA * w * w * Ra * Ra) / 3;
  const pitch = pitchModes({ M, I, a: cmFromNose, Ra, w });
  return {
    ...base,
    ok: true,
    Ta,
    T0,
    sAllow,
    A,
    Tbreak: eta * mat.sigma * A, // разрывная нагрузка каната
    diameter: 2 * Math.sqrt(A / Math.PI),
    rhoA,
    EA,
    mTether,
    tetherFraction: mTether / (2 * M),
    // формулы мод выведены для троса много легче кораблей
    heavyTether: mTether / (2 * M) > 0.05,
    stretchHalf,
    strainMax: T0 / EA,
    I,
    wBounce: bounceOmega({ EA, l0: Ra - stretchHalf, M, mTether, w }),
    // первая поперечная мода струны длиной 2Ra при среднем натяжении
    wString: (Math.PI / (2 * Ra)) * Math.sqrt(Tmean / rhoA),
    waveSpeed: Math.sqrt(Tmean / rhoA),
    pitch,
    coriolisWalk: (2 * w * 1.0) / (gDeck * G0), // доля веса при ходьбе 1 м/с
    gradient: 1.8 / rDeck, // разница тяжести голова/ноги для роста 1,8 м
    tiltEdge: Math.atan(halfWidth / rDeck), // наклон «вертикали» у стены плоской палубы
    releaseSpeed: w * Rcm, // скорость разлёта при обрыве троса
  };
}

/**
 * Кольцевая станция: герметичная труба радиуса a, свёрнутая в кольцо радиуса R.
 * Вращательная нагрузка: обруч с погонной массой λ при скорости обода v
 * растянут силой T = λ·v². Её несёт силовой пояс сечения Ab:
 *   σ_доп·Ab = (λ_груз + ρb·Ab)·v²  ⇒  Ab = λ_груз·v² / (σ_доп − ρb·v²).
 * Гермооболочка: кольцевое напряжение p·a/t ⇒ t = p·a/σ_доп.
 * Спицы, ступица, стыковочный узел не учитываются.
 */
export function designRing(p) {
  const { gFloor, rpm, tubeRadius: a, pressure, shellMat, bandMat, SF, shieldAreal, interiorLinear } = p;
  const w = rpmToOmega(rpm);
  const R = (gFloor * G0) / (w * w);
  const v = w * R;
  const base = { w, rpm, R, v, comfort: comfortZone(rpm) };
  const sShell = shellMat.sigma / SF;
  const tShell = Math.max((pressure * a) / sShell, 1e-3);
  const lamShell = 2 * Math.PI * a * tShell * shellMat.rho;
  const lamShield = 2 * Math.PI * a * shieldAreal;
  const lamLoad = lamShell + lamShield + interiorLinear;
  const sBand = bandMat.sigma / SF;
  const vMax = Math.sqrt(sBand / bandMat.rho);
  const out = { ...base, tShell, lamShell, lamShield, lamInterior: interiorLinear, lamLoad, vMax, RmaxAtG: (vMax * vMax) / (gFloor * G0) };
  if (bandMat.rho * v * v >= sBand) {
    return { ...out, ok: false, reason: 'Скорость обода выше предельной для материала пояса: ρ·v² ≥ σ_доп.' };
  }
  const Ab = (lamLoad * v * v) / (sBand - bandMat.rho * v * v);
  const lamBand = bandMat.rho * Ab;
  const lamTotal = lamLoad + lamBand;
  const circumference = 2 * Math.PI * R;
  const mass = lamTotal * circumference;
  return {
    ...out,
    ok: true,
    Ab,
    lamBand,
    lamTotal,
    hoopTension: lamTotal * v * v,
    circumference,
    mass,
    massShell: lamShell * circumference,
    massShield: lamShield * circumference,
    massInterior: interiorLinear * circumference,
    massBand: lamBand * circumference,
    launches: mass / 100e3,
    floorArea: circumference * 2 * a * 0.8,
    coriolisWalk: (2 * w) / (gFloor * G0),
    gradient: 1.8 / R,
  };
}
