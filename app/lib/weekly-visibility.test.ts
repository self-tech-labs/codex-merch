import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPubliclyVisibleProduct,
  merchProducts,
  type MerchProduct,
} from './merch';

test('automated weekly candidates remain hidden until publication', () => {
  const candidate = structuredClone(merchProducts[0]) as MerchProduct;
  candidate.automation = {
    runId: 'x-list--123--2026-W30--weekly-merch-v1',
    runKey: 'x-list:123:2026-W30:weekly-merch-v1',
  };

  for (const status of ['draft', 'generated', 'mockups_ready', 'approved'] as const) {
    candidate.workflow.status = status;
    assert.equal(isPubliclyVisibleProduct(candidate), false);
  }

  candidate.workflow.status = 'published';
  assert.equal(isPubliclyVisibleProduct(candidate), true);
});
