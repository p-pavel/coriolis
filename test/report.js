// Печать таблицы проверок: node test/report.js
import { runAll } from '../site/js/physics/checks.js';

for (const r of runAll()) {
  const mark = r.pass ? 'OK  ' : 'FAIL';
  const nums = r.error ? r.error : `got=${fmt(r.got)} exp=${fmt(r.expected)} err=${fmt(r.err)} tol=${fmt(r.tol)}`;
  console.log(`${mark} ${r.id.padEnd(11)} ${String(r.ms).padStart(5)} ms  ${nums}  ${r.note ?? ''}`);
}

function fmt(x) {
  return typeof x === 'number' ? x.toPrecision(6) : String(x);
}
