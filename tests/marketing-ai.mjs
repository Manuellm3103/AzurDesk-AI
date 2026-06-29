import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import * as providerAccount from '../src/services/providerAccountService.js';
import marketingAI from '../src/services/marketingAIService.js';

const TENANT = 'tenant-marketing-1';

function clean() {
  db.prepare('DELETE FROM marketing_assets WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM marketing_campaigns WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM llm_providers WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM llm_usage_logs WHERE tenant_id = ?').run(TENANT);
}

test('KINDS contiene 5 agentes de marketing', () => {
  assert.deepEqual(marketingAI.KINDS, ['content', 'webpage', 'design', 'trending', 'lead']);
});

test('createCampaign y listCampaigns', () => {
  clean();
  const c = marketingAI.createCampaign(TENANT, { name: 'Q3 Launch', goal: 'leads B2B', target_audience: 'CTOs', channels: ['linkedin', 'email'] });
  assert.equal(c.name, 'Q3 Launch');
  assert.deepEqual(c.channels, ['linkedin', 'email']);
  const list = marketingAI.listCampaigns(TENANT);
  assert.equal(list.length, 1);
});

test('createAsset y attach a campaña', () => {
  clean();
  const c = marketingAI.createCampaign(TENANT, { name: 'C1', goal: 'awareness' });
  const asset = marketingAI.createAsset(TENANT, 'content', 'Post intro', 'prompt', '{"title":"Hola"}');
  const updated = marketingAI.attachAsset(c.id, TENANT, asset.id);
  assert.equal(updated.assets.length, 1);
  assert.equal(updated.assets[0], asset.id);
});

test('addLead a campaña', () => {
  clean();
  const c = marketingAI.createCampaign(TENANT, { name: 'C2', goal: 'demo' });
  const updated = marketingAI.addLead(c.id, TENANT, { email: 'lead@corp.com', source: 'web' });
  assert.equal(updated.leads.length, 1);
  assert.equal(updated.leads[0].email, 'lead@corp.com');
});

test('runAgent sin proveedores devuelve error controlado', async () => {
  clean();
  const r = await marketingAI.runAgent(TENANT, 'content', { brand: 'X', topic: 'AI' });
  assert.equal(r.success, false);
  assert.ok(r.error);
});

test('runAgent con proveedor fake guarda asset raw', async () => {
  clean();
  providerAccount.createProvider(TENANT, {
    name: 'Mock',
    kind: 'ollama',
    base_url: 'http://127.0.0.1:1',
    api_key: '',
    models: [{ id: 'fake', quality: 0.5, cost_per_1m: 0, latency_ms: 1, complexity: 'low' }]
  });
  const r = await marketingAI.runAgent(TENANT, 'content', { brand: 'X', topic: 'AI' });
  assert.equal(r.success, false);
  assert.ok(r.error.includes('connect') || r.error.includes('fetch') || r.error.includes('Ollama'));
});
