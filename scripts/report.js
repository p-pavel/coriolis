// Печать таблицы проверок обоих проектов: npm run checks
import { runAll as runCoriolis } from '../site/coriolis/js/physics/checks.js';
import { runAll as runVitok } from '../site/vitok/js/physics/checks.js';

console.log('=== Кориолис ===');
print(runCoriolis());
console.log('\n=== Один виток ===');
print(runVitok());

function print(rows) {
  for (const r of rows) {
    const mark = r.pass ? 'OK  ' : 'FAIL';
    const nums = r.error ? r.error : `got=${fmt(r.got)} exp=${fmt(r.expected)} err=${fmt(r.err)} tol=${fmt(r.tol)}`;
    console.log(`${mark} ${r.id.padEnd(18)} ${String(r.ms.toFixed?.(1) ?? r.ms).padStart(6)} ms  ${nums}  ${r.note ?? ''}`);
  }
}

function fmt(x) {
  return typeof x === 'number' ? x.toPrecision(6) : String(x);
}
