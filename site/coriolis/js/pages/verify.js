import { initPage, REPO_URL } from '../ui/common.js';
import { CHECKS } from '../physics/checks.js';

initPage('verify');
document.getElementById('issues').href = `${REPO_URL}/issues`;

const list = document.getElementById('list');
const summary = document.getElementById('summary');
const fmt = (x) => (typeof x === 'number' ? (Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(4) : x.toPrecision(6)) : String(x));

function render() {
  list.innerHTML = CHECKS.map(
    (c) => `<div class="check" id="c-${c.id}">
      <div class="head"><span class="mark wait">…</span><b>${c.title}</b></div>
      <div class="small muted">${c.explain}</div>
      <div class="nums"></div>
    </div>`,
  ).join('');
}

async function runAll() {
  render();
  let ok = 0;
  for (const c of CHECKS) {
    summary.textContent = `считается: ${c.title}`;
    await new Promise((r) => setTimeout(r, 20));
    const box = document.getElementById(`c-${c.id}`);
    const t0 = performance.now();
    let r;
    try {
      r = c.run();
    } catch (e) {
      r = { pass: false, error: String(e) };
    }
    const ms = Math.round(performance.now() - t0);
    const mark = box.querySelector('.mark');
    mark.className = `mark ${r.pass ? 'ok' : 'fail'}`;
    mark.textContent = r.pass ? 'ОК' : 'НЕТ';
    if (r.pass) ok++;
    box.querySelector('.nums').textContent = r.error
      ? r.error
      : `получено ${fmt(r.got)}${r.unit ? ' ' + r.unit : ''} · ожидается ${fmt(r.expected)} · расхождение ${fmt(r.err)} · допуск ${fmt(r.tol)} · ${ms} мс${r.note ? ' · ' + r.note : ''}`;
  }
  summary.textContent = `пройдено ${ok} из ${CHECKS.length}`;
}

document.getElementById('run').addEventListener('click', runAll);
runAll();
