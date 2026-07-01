import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticatePublicRequest,
  publicHealth,
  publicUsage,
  createPublicApiKey,
  wrapAsV1Endpoint
} from '../src/services/publicAaaSService.js';
import { createApiKey } from '../src/services/apiKeyService.js';
import db from '../src/services/db.js';

function clean() {
  // Wipe any test-only API keys we created
  db.prepare(`DELETE FROM api_keys WHERE name LIKE 'test-%'`).run();
}

test('publicHealth: returns shape with api and version', async () => {
  const h = await publicHealth();
  assert.equal(h.status, 'ok');
  assert.equal(h.api, 'aaas');
  assert.equal(h.version, '1.0.0');
});

test('authenticatePublicRequest: rejects missing api key', async () => {
  const r = await authenticatePublicRequest({ headers: {} });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'missing_api_key');
});

test('authenticatePublicRequest: rejects empty bearer', async () => {
  const r = await authenticatePublicRequest({ headers: { authorization: 'Bearer ' } });
  assert.equal(r.ok, false);
});

test('authenticatePublicRequest: rejects invalid api key', async () => {
  const r = await authenticatePublicRequest({ headers: { authorization: 'Bearer azdk_invalid_xyz' } });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'invalid_api_key');
});

test('authenticatePublicRequest: accepts valid api key with tenant context', async () => {
  clean();
  const k = await createApiKey('tenant-1', { name: 'test-public-1', scopes: ['aaas:read', 'aaas:write'] });
  const r = await authenticatePublicRequest({ headers: { authorization: `Bearer ${k.key}` } });
  assert.equal(r.ok, true);
  assert.equal(r.ctx.tenantId, 'tenant-1');
  assert.deepEqual(r.ctx.scopes, ['aaas:read', 'aaas:write']);
  assert.ok(r.ctx.rate.limit > 0);
  assert.ok(r.ctx.quota.used >= 1);
  clean();
});

test('authenticatePublicRequest: accepts x-api-key header (no Bearer)', async () => {
  clean();
  const k = await createApiKey('tenant-2', { name: 'test-public-2' });
  const r = await authenticatePublicRequest({ headers: { 'x-api-key': k.key } });
  assert.equal(r.ok, true);
  assert.equal(r.ctx.tenantId, 'tenant-2');
  clean();
});

test('authenticatePublicRequest: case-insensitive bearer prefix', async () => {
  clean();
  const k = await createApiKey('tenant-3', { name: 'test-public-3' });
  const r = await authenticatePublicRequest({ headers: { authorization: `bearer ${k.key}` } });
  assert.equal(r.ok, true);
  clean();
});

test('authenticatePublicRequest: rate limit kicks in after RATE_PER_MINUTE', async () => {
  // Direct unit test of the rate limit logic. We bypass authenticatePublicRequest
  // to avoid cross-test pollution of the shared DB-backed apiKeyService and the
  // in-memory rate-limit slot (which is shared across all test files in this run).
  const { checkRateLimit } = await import('../src/services/publicAaaSService.js');
  // Use a unique key id per test run so other tests' slots don't bleed in.
  const apiKeyId = `test-rl-${Date.now()}-${Math.random()}`;
  let lastResult;
  for (let i = 0; i < 65; i++) {
    lastResult = checkRateLimit(apiKeyId);
  }
  assert.equal(lastResult.allowed, false);
  assert.equal(lastResult.limit, 60);
  assert.ok(lastResult.retryAfter > 0);
});

test('createPublicApiKey: returns raw key + persisted id', async () => {
  clean();
  const k = await createPublicApiKey('tenant-pub', { name: 'test-pub', environment: 'live' });
  assert.ok(k.key);
  assert.ok(k.id);
  // raw key should be at least 16 chars
  assert.ok(k.key.length >= 16);
  clean();
});

test('publicUsage: returns quota consumption', async () => {
  clean();
  const k = await createApiKey('tenant-usage', { name: 'test-usage' });
  await authenticatePublicRequest({ headers: { authorization: `Bearer ${k.key}` } });
  const u = publicUsage(k.id);
  assert.equal(u.period, new Date().toISOString().slice(0, 7));
  assert.ok(u.used >= 1);
  assert.ok(u.limit >= 1);
  assert.ok(u.remaining >= 0);
  clean();
});

test('wrapAsV1Endpoint: returns v1 shape with rate headers on success', async () => {
  clean();
  const k = await createApiKey('tenant-wrap', { name: 'test-wrap' });
  const handler = wrapAsV1Endpoint(async (ctx) => ({ body: { hello: 'world' } }));
  const out = await handler({ headers: { authorization: `Bearer ${k.key}` } }, {});
  assert.equal(out.status, 200);
  assert.equal(out.body.hello, 'world');
  assert.equal(out.body.api_version, 'v1');
  assert.ok(out.headers['X-RateLimit-Limit']);
  assert.ok(out.headers['X-Quota-Used']);
  clean();
});

test('wrapAsV1Endpoint: returns 500 with error message on internal failure', async () => {
  clean();
  const k = await createApiKey('tenant-err', { name: 'test-err' });
  const handler = wrapAsV1Endpoint(async () => { throw new Error('boom'); });
  const out = await handler({ headers: { authorization: `Bearer ${k.key}` } }, {});
  assert.equal(out.status, 500);
  assert.equal(out.body.error, 'internal_error');
  assert.match(out.body.message, /boom/);
  clean();
});

test('wrapAsV1Endpoint: returns 401 on missing api key', async () => {
  const handler = wrapAsV1Endpoint(async () => ({ body: { x: 1 } }));
  const out = await handler({ headers: {} }, {});
  assert.equal(out.status, 401);
  assert.equal(out.body.error, 'missing_api_key');
});