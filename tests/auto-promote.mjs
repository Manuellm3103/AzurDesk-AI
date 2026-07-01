import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribe, adminProvisionEnterprise, ensureSchema } from '../src/services/billingV2Service.js';
import {
  setRateLimitsForTenant,
  clearRateLimitsForTenant,
  checkRateLimit,
  checkQuota,
  RATE_PER_MINUTE,
  QUOTA_PER_MONTH
} from '../src/services/publicAaaSService.js';
import db from '../src/services/db.js';

function clean() {
  ensureSchema();
  db.exec(`DELETE FROM billing_subscriptions; DELETE FROM billing_usage_events; DELETE FROM billing_invoices;`);
}

test('auto-promote: Pro subscribe elevates rate cap from 60 to 600', async () => {
  clean();
  const before = checkRateLimit('test-key-1');
  assert.equal(before.limit, 60);
  await subscribe('t-pro1', 'pro');
  // After upgrade, tenant's rate cap should be 600
  const after = checkRateLimit('test-key-1', { tenantId: 't-pro1' });
  assert.equal(after.limit, 600);
});

test('auto-promote: Pro subscribe elevates quota from 100k to 1M', async () => {
  clean();
  const before = checkQuota('test-key-2');
  assert.equal(before.limit, 100_000);
  await subscribe('t-pro2', 'pro');
  const after = checkQuota('test-key-2', { tenantId: 't-pro2' });
  assert.equal(after.limit, 1_000_000);
});

test('auto-promote: Free subscribe leaves defaults (idempotent)', async () => {
  clean();
  await subscribe('t-free', 'free');
  const result = checkRateLimit('test-key-3', { tenantId: 't-free' });
  assert.equal(result.limit, 60);
});

test('auto-promote: Enterprise subscribe elevates to 6000 req/min', async () => {
  clean();
  await adminProvisionEnterprise('t-ent1');
  const result = checkRateLimit('test-key-4', { tenantId: 't-ent1' });
  assert.equal(result.limit, 6000);
});

test('auto-promote: upgrade from Free to Pro is immediate', async () => {
  clean();
  await subscribe('t-up', 'free');
  const before = checkRateLimit('test-key-5', { tenantId: 't-up' });
  assert.equal(before.limit, 60);
  await subscribe('t-up', 'pro');
  const after = checkRateLimit('test-key-5', { tenantId: 't-up' });
  assert.equal(after.limit, 600);
});

test('auto-promote: downgrade from Pro to Free reverts limits', async () => {
  clean();
  await subscribe('t-down', 'pro');
  assert.equal(checkRateLimit('k6', { tenantId: 't-down' }).limit, 600);
  await subscribe('t-down', 'free');
  assert.equal(checkRateLimit('k6', { tenantId: 't-down' }).limit, 60);
});

test('setRateLimitsForTenant: explicit override (admin use)', () => {
  setRateLimitsForTenant('t-custom', { ratePerMinute: 9999, quotaPerMonth: 9999 });
  const result = checkRateLimit('k7', { tenantId: 't-custom' });
  assert.equal(result.limit, 9999);
  clearRateLimitsForTenant('t-custom');
  // After clear, defaults apply
  const after = checkRateLimit('k7', { tenantId: 't-custom' });
  assert.equal(after.limit, 60);
});
