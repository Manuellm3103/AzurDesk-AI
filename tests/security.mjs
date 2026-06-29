import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from './_testHelpers.mjs';

const TENANT = 'tenant-security-1';

async function getToken() {
  const r = await request('POST', '/api/auth/login', { email: 'admin@azurdesk.ai', password: 'admin123' });
  return r.body.token;
}

test('health expone checks de db y jwt', async () => {
  const r = await request('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.ok(r.body.checks.db);
  assert.ok(typeof r.body.checks.jwt === 'boolean');
});

test('login rechaza body vacío con 400', async () => {
  const r = await request('POST', '/api/auth/login', {});
  assert.equal(r.status, 400);
  assert.equal(r.body.success, false);
});

test('payload mayor a 1MB retorna 413', async () => {
  const token = await getToken();
  const bigBody = { body: 'x'.repeat(2 * 1024 * 1024) };
  const r = await request('POST', '/api/tickets', bigBody, token);
  assert.equal(r.status, 413);
});

test('AAAS providers POST requiere admin', async () => {
  const login = await request('POST', '/api/auth/login', { email: 'agent1@azurdesk.ai', password: 'agent123' });
  const token = login.body.token;
  const r = await request('POST', '/api/aaas/providers', { name: 'X', kind: 'ollama' }, token);
  assert.equal(r.status, 403);
});

test('provider no expone api_key en respuesta', async () => {
  const token = await getToken();
  const r = await request('POST', '/api/aaas/providers', {
    name: 'Secret Test',
    kind: 'ollama',
    api_key: 'super-secret-key',
    models: [{ id: 'llama3.1' }]
  }, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.provider.api_key, undefined);
  assert.equal(r.body.provider.api_key_ciphertext, undefined);
  assert.equal(r.body.provider.api_key_nonce, undefined);
});

test('404 endpoint no filtra stack trace', async () => {
  const r = await request('GET', '/api/nonexistent');
  assert.equal(r.status, 404);
  assert.equal(r.body.success, false);
  assert.equal(r.body.detail, undefined);
});
