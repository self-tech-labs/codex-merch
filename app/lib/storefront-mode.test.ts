import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canInitiateStorefrontCheckout,
  resolveStorefrontMode,
} from './storefront-mode';

test('storefront mode defaults unknown and missing values to preview', () => {
  assert.equal(resolveStorefrontMode(undefined), 'preview');
  assert.equal(resolveStorefrontMode(''), 'preview');
  assert.equal(resolveStorefrontMode('staging'), 'preview');
});

test('storefront mode accepts only the explicit production value', () => {
  assert.equal(resolveStorefrontMode('production'), 'production');
  assert.equal(resolveStorefrontMode('PRODUCTION'), 'preview');
  assert.equal(resolveStorefrontMode(' production '), 'preview');
});

test('preview mode cannot initiate checkout for a catalog-eligible product', () => {
  assert.equal(canInitiateStorefrontCheckout('preview', true), false);
  assert.equal(canInitiateStorefrontCheckout('production', false), false);
  assert.equal(canInitiateStorefrontCheckout('production', true), true);
});
