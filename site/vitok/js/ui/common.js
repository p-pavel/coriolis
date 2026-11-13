import { mountChrome, REPO_URL, num, fixed, force, mass, len, period, angleDeg, slider, select, button, kvTable, fitCanvas } from '../../../js/shared/ui.js';

export { REPO_URL, num, fixed, force, mass, len, period, angleDeg, slider, select, button, kvTable, fitCanvas };

const PAGES = [
  ['flight.html', 'Полёт', 'flight'],
  ['physics.html', 'Физика', 'physics'],
  ['verify.html', 'Проверка', 'verify'],
];

export function initPage(active) {
  mountChrome({
    brand: 'Один виток',
    brandHref: 'index.html',
    pages: PAGES,
    active,
    hubHref: '../index.html',
    hubLabel: 'Зелёный кот',
    footerHtml: `Песочница: круговая НОО и подспутниковая точка. Физика открыта и проверяема:
    <a href="verify.html">проверки</a> · <a href="physics.html">выводы формул</a> ·
    <a href="${REPO_URL}">исходный код</a> ·
    <a href="../index.html">дискуссии у Зелёного кота</a>`,
  });
}
