import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import * as providerAccount from '../src/services/providerAccountService.js';

const TENANT = 'tenant-aaas-1';

function clean() {
  db.prepare('DELETE FROM llm_providers WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM llm_usage_logs WHERE tenant_id = ?').run(TENANT);
}

test('createProvider almacena API key cifrada y no la expone', () => {
  clean();
  const p = providerAccount.createProvider(TENANT, {
    name: 'Ollama Local',
    kind: 'ollama',
    base_url: 'http://localhost:11434',
    api_key: 'secret-key-123',
    models: [{ id: 'llama3.1', quality: 0.75, cost_per_1m: 0, latency_ms: 2000, complexity: ['low', 'medium'] }]
  });
  assert.ok(p.id);
  assert.equal(p.name, 'Ollama Local');
  assert.equal(p.api_key, undefined);
  const providers = providerAccount.listProviders(TENANT);
  assert.equal(providers.length, 1);
  const decrypted = providerAccount.getDecryptedKey(p.id, TENANT);
  assert.equal(decrypted, 'secret-key-123');
});

test('updateProvider cambia nombre y modelos sin perder key', () => {
  clean();
  const p = providerAccount.createProvider(TENANT, {
    name: 'Ollama',
    kind: 'ollama',
    base_url: 'http://localhost:11434',
    api_key: 'k1',
    models: [{ id: 'a' }]
  });
  const updated = providerAccount.updateProvider(p.id, TENANT, { name: 'Ollama Renamed', models: [{ id: 'b' }] });
  assert.equal(updated.name, 'Ollama Renamed');
  assert.equal(updated.models[0].id, 'b');
  assert.equal(providerAccount.getDecryptedKey(p.id, TENANT), 'k1');
});

test('usageStats acumula uso por proveedor', () => {
  clean();
  providerAccount.createProvider(TENANT, { name: 'X', kind: 'ollama', models: [] });
  providerAccount.logUsage({ tenant_id: TENANT, provider_id: 'p1', model: 'm1', operation: 'test', input_tokens: 100, output_tokens: 50, cost_usd: 0.0001, latency_ms: 120, success: true });
  const stats = providerAccount.usageStats(TENANT);
  assert.equal(stats.total, 1);
  assert.equal(stats.success, 1);
  assert.ok(stats.cost > 0);
});

test('deleteProvider elimina solo del tenant correcto', () => {
  clean();
  const p = providerAccount.createProvider(TENANT, { name: 'Y', kind: 'ollama', models: [] });
  const other = providerAccount.createProvider('other-tenant', { name: 'Z', kind: 'ollama', models: [] });
  const deleted = providerAccount.deleteProvider(p.id, TENANT);
  assert.equal(deleted, true);
  assert.ok(providerAccount.getProvider(other.id, 'other-tenant'));
  db.prepare('DELETE FROM llm_providers WHERE tenant_id = ?').run('other-tenant');
});
