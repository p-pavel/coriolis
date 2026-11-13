import { initPage, REPO_URL } from '../ui/common.js';
import { CHECKS } from '../physics/checks.js';

initPage('verify');

const root = document.getElementById('checks');
for (const c of CHECKS) {
  const div = document.createElement('div');
  div.className = 'check';
  div.innerHTML = `<div class="head"><span class="mark wait">…</span><strong>${c.title}</strong></div>
    <div class="nums"></div>`;
  root.append(div);
  const mark = div.querySelector('.mark');
  const nums = div.querySelector('.nums');
  try {
    const r = c.run();
    mark.textContent = r.pass ? 'OK' : 'FAIL';
    mark.className = 'mark ' + (r.pass ? 'ok' : 'fail');
    nums.textContent = r.note
      ? `${r.note} · got=${fmt(r.got)} exp=${fmt(r.expected)} err=${fmt(r.err)} tol=${fmt(r.tol)}`
      : `got=${fmt(r.got)} expected=${fmt(r.expected)} err=${fmt(r.err)} tol=${fmt(r.tol)}`;
  } catch (e) {
    mark.textContent = 'FAIL';
    mark.className = 'mark fail';
    nums.textContent = String(e);
  }
}

const foot = document.createElement('p');
foot.className = 'muted';
foot.innerHTML = `Те же проверки: <code>node --test test/vitok/</code>. Код: <a href="${REPO_URL}">репозиторий</a>.`;
root.after(foot);

function fmt(x) {
  return typeof x === 'number' ? x.toPrecision(6) : String(x);
}
