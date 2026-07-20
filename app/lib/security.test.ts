import assert from 'node:assert/strict';
import test from 'node:test';
import {applySecurityHeaders} from './security.server';

test('security headers use a nonce and production transport policy', () => {
  const headers = new Headers();
  applySecurityHeaders(headers, 'test-nonce', true);
  assert.match(headers.get('content-security-policy') || '', /nonce-test-nonce/);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('strict-transport-security') || '', /max-age=/);
});
