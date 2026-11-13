import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS } from '../../site/coriolis/js/physics/checks.js';

for (const c of CHECKS) {
  test(`coriolis ${c.id}: ${c.title}`, () => {
    const r = c.run();
    const msg = `got=${r.got} expected=${r.expected} err=${r.err} tol=${r.tol} ${r.note ?? ''}`;
    assert.ok(r.pass, msg);
  });
}
