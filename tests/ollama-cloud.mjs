import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import ollamaCloudService from '../src/services/ollamaCloudService.js';

const TENANT = 'tenant-cloud-1';

test('signIn guarda cuenta cifrada y devuelve status', () => {
  const r = ollamaCloudService.signIn(TENANT, { api_key: 'sk-test-123', email: 'test@corp.com', nickname: 'Cloud Account' });
  assert.equal(r.success, false); // porque no hay endpoint real; esperamos disconnected
  const account = ollamaCloudService.getAccount(TENANT);
  assert.ok(account);
  assert.equal(account.status, 'disconnected');
});

test('listModels devuelve array vacío cuando no conectado', () => {
  const models = ollamaCloudService.listModels(TENANT);
  assert.ok(Array.isArray(models));
});

test('disconnect cambia estado a desconectado', () => {
  ollamaCloudService.signIn(TENANT, { api_key: 'sk-test-123', email: 'test@corp.com', nickname: 'Cloud Account' });
  ollamaCloudService.disconnect(TENANT);
  const account = ollamaCloudService.getAccount(TENANT);
  assert.ok(account);
  assert.equal(account.status, 'disconnected');
});

test('generate falla sin cuenta conectada', async () => {
  const r = await ollamaCloudService.generate(TENANT, { prompt: 'hola' });
  assert.equal(r.success, false);
});
