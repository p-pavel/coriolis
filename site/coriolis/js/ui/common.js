// Навигация и реэкспорт общего UI для песочницы «Кориолис».

import { mountChrome, REPO_URL, loadKatex, num, fixed, force, mass, len, period, slider, select, button, kvTable, fitCanvas } from '../../../js/shared/ui.js';

export { REPO_URL, loadKatex, num, fixed, force, mass, len, period, slider, select, button, kvTable, fitCanvas };

const PAGES = [
  ['tether.html', 'Два корабля на тросе', 'tether'],
  ['apple.html', 'Яблоко', 'apple'],
  ['climb.html', 'Переход по тросу', 'climb'],
  ['ring.html', 'Кольцо', 'ring'],
  ['physics.html', 'Физика', 'physics'],
  ['verify.html', 'Проверка', 'verify'],
];

export function initPage(active) {
  mountChrome({
    brand: 'Кориолис',
    brandHref: 'index.html',
    pages: PAGES,
    active,
    hubHref: '../index.html',
    hubLabel: 'Зелёный кот',
    footerHtml: `Песочница искусственной тяжести. Физика открыта и проверяема:
    <a href="verify.html">проверки</a> · <a href="physics.html">выводы формул</a> ·
    <a href="${REPO_URL}">исходный код</a> ·
    <a href="../index.html">дискуссии у Зелёного кота</a>`,
  });
}
