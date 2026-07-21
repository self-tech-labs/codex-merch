import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertJuryAccessCode,
  assertJurySalesConfiguration,
  isJurySalesWindowOpen,
  jurySalesEndAt,
} from './jury-access.server';

const configured: AppEnv = {
  JURY_SALES_ENABLED: 'true',
  JURY_ACCESS_CODE: ['build', 'week', 'judge', '2026'].join('-'),
  JURY_SALES_END_AT: '2026-08-06T00:00:00Z',
};

test('jury sales require an explicit, unexpired configuration', () => {
  const duringJudging = Date.parse('2026-07-25T12:00:00Z');
  assert.doesNotThrow(() =>
    assertJurySalesConfiguration(configured, duringJudging),
  );
  assert.equal(isJurySalesWindowOpen(configured, duringJudging), true);
  assert.equal(
    jurySalesEndAt(configured)?.value,
    '2026-08-06T00:00:00Z',
  );
  assert.equal(
    isJurySalesWindowOpen(
      {...configured, JURY_SALES_ENABLED: 'false'},
      duringJudging,
    ),
    false,
  );
  assert.equal(
    isJurySalesWindowOpen(
      {...configured, JURY_ACCESS_CODE: 'too-short'},
      duringJudging,
    ),
    false,
  );
  assert.equal(
    isJurySalesWindowOpen(configured, Date.parse(configured.JURY_SALES_END_AT!)),
    false,
  );
});

test('jury access uses one generic denial for missing or incorrect codes', () => {
  const duringJudging = Date.parse('2026-07-25T12:00:00Z');
  assert.doesNotThrow(() =>
    assertJuryAccessCode(configured, ' build-week-judge-2026 ', duringJudging),
  );
  assert.throws(
    () => assertJuryAccessCode(configured, 'not-a-judge', duringJudging),
    /could not be verified/,
  );
  assert.throws(
    () => assertJuryAccessCode(configured, null, duringJudging),
    /could not be verified/,
  );
});
