import { initPage, slider, select, kvTable, button, num, fixed, period, angleDeg, len } from '../ui/common.js';
import { SITES, rad, H_GEO } from '../physics/constants.js';
import { minInclination } from '../physics/orbit.js';
import { buildMission, sampleTrack } from '../physics/ascent.js';
import { closureReport, circularForRepeatOrbits } from '../physics/groundtrack.js';
import { drawFlatMap, drawGlobe } from '../ui/maps.js';

initPage('flight');

const ctl = document.getElementById('controls');
const kv = document.getElementById('kv');
const verdict = document.getElementById('verdict');
const mapCanvas = document.getElementById('map');
const globeCanvas = document.getElementById('globe');

/** 'one' = НОО + один виток (невозможность); 'explore' = возможности: N=1…15. */
let mode = 'one';
let siteKey = 'baikonur';
let lat = SITES.baikonur.lat;
let lon = SITES.baikonur.lon;
let hKm = 400;
let iDeg = 51.6;
let TascMin = 10;
let nOrbitsShow = 3;
let view = { yaw: 0.9, pitch: 0.15 };
const H_GEO_KM = H_GEO / 1000;
let playing = true;
let tShow = 0;
let mission = null;
let trackFull = null;
let returnPt = null;
let afterOnePt = null;
let closestPt = null;
let lastRep = null;

select(ctl, {
  label: 'Вопрос',
  value: mode,
  options: [
    { value: 'one', text: 'НОО: за один виток? (нельзя)' },
    { value: 'explore', text: 'Возможности: N витков / GEO' },
  ],
  hint: 'Сначала фиксируем невозможность на НОО; затем смотрим, при каких T/N возврат есть — включая N=1 (геосинхрон)',
  onChange: (v) => {
    mode = v;
    applyModeDefaults();
    rebuild();
  },
});

select(ctl, {
  label: 'Точка старта',
  value: siteKey,
  options: [
    ...Object.entries(SITES).map(([k, v]) => ({ value: k, text: v.name })),
    { value: 'custom', text: 'Своя (широта/долгота)' },
  ],
  onChange: (v) => {
    siteKey = v;
    if (v !== 'custom') {
      lat = SITES[v].lat;
      lon = SITES[v].lon;
      latSl.value = (lat * 180) / Math.PI;
      lonSl.value = (lon * 180) / Math.PI;
    }
    rebuild();
  },
});

const latSl = slider(ctl, {
  label: 'Широта старта',
  min: -70,
  max: 70,
  step: 0.05,
  value: (lat * 180) / Math.PI,
  fmt: (v) => `${fixed(v, 2)}°`,
  text: true,
  onInput: (v) => {
    siteKey = 'custom';
    lat = rad(v);
    rebuild();
  },
});

const lonSl = slider(ctl, {
  label: 'Долгота старта',
  min: -180,
  max: 180,
  step: 0.1,
  value: (lon * 180) / Math.PI,
  fmt: (v) => `${fixed(v, 1)}°`,
  text: true,
  onInput: (v) => {
    siteKey = 'custom';
    lon = rad(v);
    rebuild();
  },
});

const hSl = slider(ctl, {
  label: 'Высота круговой орбиты',
  min: 200,
  max: 2000,
  step: 1,
  value: hKm,
  fmt: (v) => `${num(v, 4)} км`,
  text: true,
  hint: 'НОО: период десятки минут. Поле справа — точный ввод',
  onInput: (v) => {
    hKm = v;
    rebuild();
  },
});

const iSl = slider(ctl, {
  label: 'Наклонение',
  min: 0,
  max: 98,
  step: 0.05,
  value: iDeg,
  fmt: (v) => `${fixed(v, 2)}°`,
  text: true,
  hint: 'Нельзя меньше широты старта без смены плоскости',
  onInput: (v) => {
    iDeg = v;
    rebuild();
  },
});

slider(ctl, {
  label: 'Длительность разгона',
  min: 4,
  max: 20,
  step: 0.1,
  value: TascMin,
  fmt: (v) => `${fixed(v, 1)} мин`,
  text: true,
  hint: 'Кинематическая схема разгона (не баллистика). Для GEO за минуты — заведомо не физично; смотрите трассу, не Δv',
  onInput: (v) => {
    TascMin = v;
    rebuild();
  },
});

const nSl = slider(ctl, {
  label: 'Показать витков на карте',
  min: 1,
  max: 16,
  step: 1,
  value: nOrbitsShow,
  fmt: (v) => `${v}`,
  onInput: (v) => {
    nOrbitsShow = v;
    rebuild();
  },
});

const presetBox = document.createElement('div');
presetBox.className = 'btns';
ctl.append(presetBox);

const hHint = hSl.el.querySelector('.hint');

function setHeightRange(min, max, step) {
  hSl.setRange(min, max, step);
}

function setOrbitShowMax(max) {
  nSl.setRange(1, max, 1);
  if (nOrbitsShow > max) {
    nOrbitsShow = max;
    nSl.value = max;
  }
}

/** Высота, при которой N·ω_E·T = 2π (ровно N витков на сидерические сутки). */
function applyRepeatPreset(N) {
  const { h } = circularForRepeatOrbits(N);
  // Точная высота резонанса: временно step=any, чтобы GEO не «уплыл».
  hKm = h / 1000;
  hSl.setRange(200, Math.ceil(H_GEO_KM + 100), 'any');
  hSl.value = hKm;
  hSl.setRange(200, Math.ceil(H_GEO_KM + 100), mode === 'one' ? 1 : 5);
  const nMax = mode === 'explore' ? 24 : 16;
  nOrbitsShow = Math.min(nMax, Math.max(N + 1, 2));
  nSl.value = nOrbitsShow;
}

function applyModeDefaults() {
  presetBox.replaceChildren();
  if (mode === 'one') {
    setHeightRange(200, 2000, 10);
    setOrbitShowMax(16);
    hKm = Math.min(hKm, 2000);
    if (hKm > 2000) hKm = 400;
    hSl.value = hKm;
    nOrbitsShow = 3;
    nSl.value = 3;
    if (hHint) hHint.textContent = 'Режим НОО (до 2000 км): за один виток в старт не попасть';
  } else {
    setHeightRange(200, Math.ceil(H_GEO_KM + 100), 5);
    setOrbitShowMax(24);
    if (hHint)
      hHint.textContent = `T = T_sid/N; GEO (N=1) ≈ ${num(H_GEO_KM, 4)} км. Пресеты ставят точную высоту резонанса.`;
    button(presetBox, 'N = 1 (GEO)', () => {
      applyRepeatPreset(1);
      rebuild();
    });
    button(presetBox, 'N = 2 (12 ч)', () => {
      applyRepeatPreset(2);
      rebuild();
    });
    button(presetBox, 'N = 3', () => {
      applyRepeatPreset(3);
      rebuild();
    });
    button(presetBox, 'N = 4', () => {
      applyRepeatPreset(4);
      rebuild();
    });
    button(presetBox, 'НОО ~15 витков/сут', () => {
      applyRepeatPreset(15);
      rebuild();
    });
    applyRepeatPreset(2);
  }
}

applyModeDefaults();

let showFull = false;
let animSpeed = 80; // множитель к реальному времени

select(ctl, {
  label: 'Траектория',
  value: 'grow',
  options: [
    { value: 'grow', text: 'Нарастающая (анимация)' },
    { value: 'full', text: 'Вся трасса сразу' },
  ],
  hint: '«Вся сразу» рисует полный путь; маркер всё ещё бежит, если анимация включена',
  onChange: (v) => {
    showFull = v === 'full';
    redraw(tShow);
  },
});

slider(ctl, {
  label: 'Ускорение анимации',
  min: 5,
  max: 2000,
  step: 1,
  value: animSpeed,
  scale: 'log',
  fmt: (v) => `×${num(v, 3)}`,
  hint: 'Во сколько раз быстрее реального полётного времени',
  onInput: (v) => {
    animSpeed = v;
  },
});

let syncingScrub = false;
const tSl = slider(ctl, {
  label: 'Ход анимации',
  min: 0,
  max: 1,
  step: 1,
  value: 0,
  fmt: (v) => period(v),
  hint: 'Положение на заданный момент; двигаете — анимация встаёт на паузу',
  onInput: (v) => {
    if (syncingScrub) return;
    tShow = v;
    if (playing) {
      playing = false;
      playBtn.textContent = 'Пуск';
      playBtn.classList.add('on');
    }
    redraw(tShow);
  },
});

const btns = document.createElement('div');
btns.className = 'btns';
ctl.append(btns);
button(btns, 'Сброс анимации', () => {
  tShow = 0;
  syncScrubber();
  redraw(tShow);
});
const playBtn = button(btns, 'Пауза', () => {
  playing = !playing;
  playBtn.textContent = playing ? 'Пауза' : 'Пуск';
  playBtn.classList.toggle('on', !playing);
});

function syncScrubber() {
  if (!mission?.ok) return;
  const tEnd = Math.max(1, mission.Tasc + nDrawCount() * mission.Torb);
  syncingScrub = true;
  tSl.setRange(0, tEnd, Math.max(1, tEnd / 2000));
  tSl.value = Math.min(tShow, tEnd);
  syncingScrub = false;
}

const timeReadout = document.createElement('p');
timeReadout.className = 'muted small';
timeReadout.id = 'timeReadout';
ctl.append(timeReadout);

function nDrawCount() {
  if (mode === 'explore' && lastRep?.orbitsToLonRepeat != null) {
    return Math.max(nOrbitsShow, Math.min(24, lastRep.orbitsToLonRepeat + 1));
  }
  return nOrbitsShow;
}

function siteLabel() {
  if (siteKey !== 'custom' && SITES[siteKey]) return SITES[siteKey].name;
  return 'старт';
}

function rebuild() {
  const i = rad(iDeg);
  mission = buildMission({
    lat0: lat,
    lon0: lon,
    h: hKm * 1000,
    i,
    Tasc: TascMin * 60,
  });
  if (!mission.ok) {
    verdict.className = 'verdict bad';
    verdict.innerHTML = `Наклонение (${fixed(iDeg, 1)}°) меньше широты старта (${angleDeg(Math.abs(lat))}):
      без смены плоскости такая круговая орбита недоступна. Поднимите i или смените старт
      (минимум i = |φ| ≈ ${fixed((minInclination(lat) * 180) / Math.PI, 1)}°).`;
    kvTable(kv, []);
    trackFull = [];
    returnPt = null;
    afterOnePt = null;
    closestPt = null;
    lastRep = null;
    redraw(0);
    return;
  }
  const rep = closureReport(mission);
  lastRep = rep;

  const nDraw = nDrawCount();
  const tEnd = mission.Tasc + nDraw * mission.Torb;
  trackFull = sampleTrack(mission, tEnd, Math.max(200, nDraw * 120));

  returnPt = null;
  if (mode === 'explore' && rep.afterNOrbits) {
    returnPt = {
      lat: rep.afterNOrbits.lat,
      lon: rep.afterNOrbits.lon,
      label: `N=${rep.afterNOrbits.n}`,
    };
  }
  afterOnePt = {
    lat: rep.afterOneOrbit.lat,
    lon: rep.afterOneOrbit.lon,
    label: 'через 1 виток',
  };
  closestPt = rep.closestOnFirstOrbit
    ? {
        lat: rep.closestOnFirstOrbit.lat,
        lon: rep.closestOnFirstOrbit.lon,
        label: `ближ. ${num(rep.closestOnFirstOrbit.missKm, 3)} км`,
      }
    : null;

  if (mode === 'one') {
    verdict.className = 'verdict ' + (rep.returnsAfterOneOrbit ? 'warn' : 'bad');
    verdict.innerHTML = rep.returnsAfterOneOrbit
      ? 'Период почти равен сидерическим суткам — это уже не НОО. За один виток долгота сходится (см. режим «Возможности»).'
      : `<b>За один виток на НОО — не над стартом.</b> Земля поворачивается на
      ${fixed(rep.earthTurnPerOrbitDeg, 1)}°, Δλ = ${fixed(rep.dLonPerOrbitDeg, 1)}°.
      Кратчайшее расстояние трассы к старту за первые ~1,5 витка после выхода на орбиту:
      <b>${num(rep.closestOnFirstOrbit.missKm, 3)} км</b>
      (на карте — метка «ближ.»; «промах через 1 виток» — в той же фазе, что старт).
      Пролететь над районом <em>без посадки</em> позже — режим «Возможности».`;
  } else if (rep.afterNOrbits) {
    const a = rep.afterNOrbits;
    const leo = mission.h < 2000e3;
    if (a.n === 1) {
      verdict.className = 'verdict';
      verdict.innerHTML = `<b>N = 1 — геосинхрон:</b> за один виток снова та же долгота (не НОО, h ≈ ${len(mission.h)}).
        Это снова <em>пролёт</em> / зависание трассы, не посадка.
        С широты ${angleDeg(lat)} — наклонная GSO (геостационар i=0 без смены плоскости нельзя).
        Промах модели ~${num(a.missKm, 3)} км.`;
    } else {
      verdict.className = 'verdict';
      verdict.innerHTML = `<b>Да: пролететь над стартом можно</b> — без посадки, после ~${a.n} витков
        (N ≈ T<sub>sid</sub>/T = ${num(rep.orbitsPerDayFloat, 3)}, остаток ${fixed(a.residualDeg, 2)}°).
        Подспутниковая точка снова у старта; корабль при этом остаётся на орбите.
        Промах в фазе старта ~${num(a.missKm, 3)} км
        (дуга разгона ~${fixed(rep.ascentDownrangeDeg, 1)}°).
        ${leo ? 'На НОО это порядка суток.' : 'Выше НОО — меньше N; Δv в таблице не бюджет на GEO.'}
        Посадка = ещё Δv и атмосфера — здесь не моделируем.`;
    }
  } else {
    verdict.className = 'verdict warn';
    verdict.textContent = 'Не удалось найти N≤400 с допуском 0,5° по долготе — сдвиньте высоту.';
  }

  kvTable(kv, [
    '#Старт и орбита',
    ['Широта старта', angleDeg(lat)],
    ['Долгота старта', angleDeg(lon)],
    ['Наклонение', `${fixed(iDeg, 1)}°`],
    ['Азимут пуска', mission.Az != null ? angleDeg(mission.Az) : '—'],
    ['Высота', len(mission.h)],
    ['Период', period(mission.Torb)],
    ['Период / сидерические сутки', num(rep.periodVsSidereal, 3)],
    '#Один–полтора витка',
    ['Поворот Земли за виток', `${fixed(rep.earthTurnPerOrbitDeg, 2)}°`],
    ['Сдвиг долготы трассы Δλ', `${fixed(rep.dLonPerOrbitDeg, 2)}°`],
    [
      'Кратчайшее до старта (1,5 витка)',
      `${num(rep.closestOnFirstOrbit.missKm, 3)} км @ ${num(rep.closestOnFirstOrbit.orbitsFromInsert, 3)} вит.`,
    ],
    ['Промах в фазе старта (ровно 1 виток)', `${num(rep.afterOneOrbit.missKm, 3)} км`],
    ['Промах у точки вставки', `${num(rep.afterOneAtInsertion.missKm, 3)} км`],
    '#Возврат ~N витков / сутки',
    ['N ≈ T_sid/T', `${rep.orbitsToLonRepeat} (точно ${num(rep.orbitsPerDayFloat, 4)})`],
    ['Остаток долготы', rep.afterNOrbits ? `${fixed(rep.afterNOrbits.residualDeg, 2)}°` : '—'],
    ['Время до фазы старта', rep.timeToLonRepeat != null ? period(rep.timeToLonRepeat) : '—'],
    ['Промах в фазе старта', rep.afterNOrbits ? `${num(rep.afterNOrbits.missKm, 3)} км` : '—'],
    '#Разгон (схема)',
    ['Время разгона', period(mission.Tasc)],
    ['Дуга вниз по трассе', `${fixed(rep.ascentDownrangeDeg, 1)}°`],
    ['Круговая скорость', `${num(mission.vCirc, 4)} м/с`],
    ['Бонус вращения Земли', `${num(mission.vRot, 3)} м/с`],
    [
      'Оценка Δv',
      mission.dVtrustworthy
        ? `~${num(mission.dVapprox, 3)} м/с (порядок для НОО)`
        : `~${num(mission.dVapprox, 3)} м/с — неверно для высоких орбит`,
    ],
  ]);
  tShow = Math.min(tShow, tEnd);
  syncScrubber();
  redraw(tShow);
}

function redraw(t) {
  const site = { lat, lon, name: siteLabel() };
  const ret = mode === 'explore' ? returnPt : null;
  if (!mission?.ok || !trackFull) {
    drawFlatMap(mapCanvas, [], site);
    drawGlobe(globeCanvas, [], site, null, view);
    timeReadout.textContent = '';
    return;
  }
  const visible = trackFull.filter((p) => p.t <= t);
  const mapOpts = {
    returnPt: ret,
    afterOne: afterOnePt,
    closest: closestPt,
    ghost: showFull ? trackFull : null,
  };
  const globeOpts = { returnPt: ret, ghost: showFull ? trackFull : null };
  drawFlatMap(mapCanvas, visible, site, mapOpts);
  drawGlobe(globeCanvas, visible, site, mission, view, globeOpts);
  const tEnd = mission.Tasc + nDrawCount() * mission.Torb;
  timeReadout.textContent = `Время полёта: ${period(t)} / ${period(tEnd)} (ускорение ×${num(animSpeed, 3)})`;
  if (!syncingScrub && playing) {
    syncingScrub = true;
    tSl.value = t;
    syncingScrub = false;
  }
}

let drag = null;
globeCanvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch };
  globeCanvas.setPointerCapture(e.pointerId);
});
globeCanvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  view.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
  view.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.01));
  redraw(tShow);
});
globeCanvas.addEventListener('pointerup', () => {
  drag = null;
});
globeCanvas.addEventListener('pointercancel', () => {
  drag = null;
});

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (playing && mission?.ok) {
    const tEnd = mission.Tasc + nDrawCount() * mission.Torb;
    tShow += dt * animSpeed;
    if (tShow > tEnd) tShow = 0;
    redraw(tShow);
  }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => redraw(tShow));
rebuild();
requestAnimationFrame(frame);
