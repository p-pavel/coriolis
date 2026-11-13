import { initPage, num, period } from '../ui/common.js';
import { SITES, rad } from '../physics/constants.js';
import { buildMission } from '../physics/ascent.js';
import { closureReport } from '../physics/groundtrack.js';

initPage('home');

const m = buildMission({
  lat0: SITES.baikonur.lat,
  lon0: SITES.baikonur.lon,
  h: 400e3,
  i: rad(51.6),
  Tasc: 600,
});
const rep = closureReport(m);

const el = document.getElementById('numbers');
if (el) {
  el.innerHTML = [
    [`${num(rep.dLonPerOrbitDeg, 3)}°`, 'сдвиг долготы за виток с 400 км'],
    [period(rep.Torb), 'период НОО 400 км'],
    [`${num(rep.afterOneOrbit.missKm, 3)} км`, 'промах в фазе старта после 1 витка'],
    [`~${rep.orbitsToLonRepeat}`, 'витков ≈ за сидерические сутки'],
  ]
    .map(([b, s]) => `<div class="n"><b>${b}</b><span>${s}</span></div>`)
    .join('');
}
