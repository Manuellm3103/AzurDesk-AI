import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiKey } from '../src/services/apiKeyService.js';
import { routeV1 } from '../src/services/publicV1Router.js';
import db from '../src/services/db.js';

function makeReq({ method = 'GET', url = '/', headers = {} } = {}) {
  return { method, url, headers, on() {} };
}

function makeRes() {
  const res = { statusCode: 200, headers: {}, _body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (n) => { res.statusCode = n; return res; };
  res.end = (b) => { res._body = b; };
  res.json = (b) => { res._body = JSON.stringify(b); };
  return res;
}

function clean() {
  db.prepare(`DELETE FROM api_keys WHERE name LIKE 'test-%'`).run();
  db.exec(`DELETE FROM marketplace_skills; DELETE FROM marketplace_installs;`);
}

test('routeV1: GET /v1/health returns 200 with api_version', async () => {
  const res = makeRes();
  await routeV1(makeReq({ url: '/v1/health' }), res, '/v1/health');
  const body = JSON.parse(res._body);
  assert.equal(body.api_version, 'v1');
  assert.equal(body.status, 'ok');
});

test('routeV1: GET /v1/aaas/models requires api key (401)', async () => {
  const res = makeRes();
  await routeV1(makeReq({ url: '/v1/aaas/models' }), res, '/v1/aaas/models');
  assert.equal(res.statusCode, 401);
  const body = JSON.parse(res._body);
  assert.equal(body.error, 'missing_api_key');
});

test('routeV1: GET /v1/aaas/models with valid key returns models list', async () => {
  clean();
  const k = await createApiKey('tenant-v1', { name: 'test-v1-models' });
  const res = makeRes();
  await routeV1(
    makeReq({ url: '/v1/aaas/models', headers: { authorization: `Bearer ${k.key}` } }),
    res,
    '/v1/aaas/models'
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res._body);
  assert.equal(body.api_version, 'v1');
  assert.ok(Array.isArray(body.models));
  assert.ok(res.headers['x-ratelimit-limit']);
  assert.ok(res.headers['x-api-key-prefix']);
  clean();
});

test('routeV1: GET /v1/aaas/usage returns quota stats for current key', async () => {
  clean();
  const k = await createApiKey('tenant-usage', { name: 'test-v1-usage' });
  const res = makeRes();
  await routeV1(
    makeReq({ url: '/v1/aaas/usage', headers: { authorization: `Bearer ${k.key}` } }),
    res,
    '/v1/aaas/usage'
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res._body);
  assert.ok(body.used >= 1);
  assert.ok(body.limit >= 1);
  assert.equal(body.api_version, 'v1');
  clean();
});

test('routeV1: POST /v1/aaas/generate with no providers returns success:false', async () => {
  clean();
  const k = await createApiKey('tenant-gen', { name: 'test-v1-gen' });
  const req = makeReq({ method: 'POST', url: '/v1/aaas/generate', headers: { authorization: `Bearer ${k.key}` } });
  req.on = (ev, cb) => { if (ev === 'data') cb('{"prompt":"hola"}'); if (ev === 'end') cb(); };
  const res = makeRes();
  await routeV1(req, res, '/v1/aaas/generate');
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res._body);
  assert.equal(body.success, false);
  assert.match(body.error || '', /proveedores|providers/i);
  clean();
});

test('routeV1: GET /v1/api-keys lists keys for tenant', async () => {
  clean();
  await createApiKey('tenant-keys', { name: 'test-v1-key1' });
  const k2 = await createApiKey('tenant-keys', { name: 'test-v1-key2' });
  const res = makeRes();
  await routeV1(
    makeReq({ url: '/v1/api-keys', headers: { authorization: `Bearer ${k2.key}` } }),
    res,
    '/v1/api-keys'
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res._body);
  assert.equal(body.success, true);
  assert.ok(body.keys.length >= 1);
  // Security: no raw key in list response
  for (const key of body.keys) assert.equal(key.key, undefined);
  clean();
});

test('routeV1: POST /v1/api-keys creates a new key', async () => {
  clean();
  const k = await createApiKey('tenant-create', { name: 'test-v1-create' });
  const req = makeReq({ method: 'POST', url: '/v1/api-keys', headers: { authorization: `Bearer ${k.key}` } });
  req.on = (ev, cb) => { if (ev === 'data') cb('{"name":"new-key"}'); if (ev === 'end') cb(); };
  const res = makeRes();
  await routeV1(req, res, '/v1/api-keys');
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res._body);
  assert.equal(body.success, true);
  assert.ok(body.key.key);
  assert.equal(body.key.name, 'new-key');
  clean();
});

test('routeV1: POST /v1/api-keys without name returns 400', async () => {
  clean();
  const k = await createApiKey('tenant-noname', { name: 'test-v1-noname' });
  const req = makeReq({ method: 'POST', url: '/v1/api-keys', headers: { authorization: `Bearer ${k.key}` } });
  req.on = (ev, cb) => { if (ev === 'data') cb('{}'); if (ev === 'end') cb(); };
  const res = makeRes();
  await routeV1(req, res, '/v1/api-keys');
  assert.equal(res.statusCode, 400);
  clean();
});

test('routeV1: GET /v1/marketplace returns skill list', async () => {
  clean();
  const { default: marketplaceService } = await import('../src/services/marketplaceService.js');
  marketplaceService.publish({ slug: 's1', name: 'S1', author: 'a', version: '1.0.0', kind: 'tool' });
  const k = await createApiKey('tenant-mp', { name: 'test-v1-mp' });
  const res = makeRes();
  await routeV1(
    makeReq({ url: '/v1/marketplace', headers: { authorization: `Bearer ${k.key}` } }),
    res,
    '/v1/marketplace'
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res._body);
  assert.equal(body.success, true);
  assert.equal(body.skills.length, 1);
  assert.equal(body.skills[0].slug, 's1');
  clean();
});

test('routeV1: unknown path returns 404', async () => {
  const res = makeRes();
  await routeV1(makeReq({ url: '/v1/nope' }), res, '/v1/nope');
  assert.equal(res.statusCode, 404);
  const body = JSON.parse(res._body);
  assert.equal(body.error, 'not_found');
});
