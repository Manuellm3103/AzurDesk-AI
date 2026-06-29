import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import * as providerAccount from '../src/services/providerAccountService.js';
import marketingAI from '../src/services/marketingAIService.js';
import legalCaseService from '../src/services/legalCaseService.js';
import radarService from '../src/services/radarService.js';

function clean(tenant) {
  for (const t of ['llm_providers', 'llm_usage_logs', 'marketing_assets', 'marketing_campaigns', 'legal_cases', 'legal_approvals', 'legal_documents', 'tickets', 'agents', 'agent_mesh_nodes', 'users']) {
    try { db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(tenant); } catch {}
  }
}

// ========== PROVIDER CRUD ==========
const TP = 'tenant-cov-providers';
clean(TP);

test('provider CRUD completo', () => {
  const created = providerAccount.createProvider(TP, { name: 'TestProv', kind: 'ollama', api_key: 'key123', models: [{ id: 'llama3' }] });
  assert.ok(created.id);
  assert.equal(created.name, 'TestProv');
  assert.equal(created.enabled, true);
  assert.deepEqual(created.models, [{ id: 'llama3' }]);
  assert.equal(created.api_key, undefined);
  assert.equal(created.api_key_ciphertext, undefined);

  const got = providerAccount.getProvider(created.id, TP);
  assert.equal(got.name, 'TestProv');

  const updated = providerAccount.updateProvider(created.id, TP, { name: 'ProvUpdated', priority: 5 });
  assert.equal(updated.name, 'ProvUpdated');
  assert.equal(updated.priority, 5);

  const list = providerAccount.listProviders(TP);
  assert.equal(list.length, 1);

  const deleted = providerAccount.deleteProvider(created.id, TP);
  assert.equal(deleted, true);
  assert.equal(providerAccount.getProvider(created.id, TP), null);
});

test('provider update con nueva api_key cifra correctamente', () => {
  const p = providerAccount.createProvider(TP, { name: 'KeyTest', kind: 'openai_compatible', api_key: 'original', models: [] });
  providerAccount.updateProvider(p.id, TP, { api_key: 'rotated' });
  const key = providerAccount.getDecryptedKey(p.id, TP);
  assert.equal(key, 'rotated');
  providerAccount.deleteProvider(p.id, TP);
});

test('usageStats registra y calcula correctamente', () => {
  const p = providerAccount.createProvider(TP, { name: 'UsageTest', kind: 'ollama', models: [{ id: 'm1' }] });
  providerAccount.logUsage({ tenant_id: TP, provider_id: p.id, model: 'm1', operation: 'generate', input_tokens: 100, output_tokens: 50, cost_usd: 0.001, latency_ms: 200, success: true });
  providerAccount.logUsage({ tenant_id: TP, provider_id: p.id, model: 'm1', operation: 'generate', input_tokens: 200, output_tokens: 80, cost_usd: 0.002, latency_ms: 400, success: false, error: 'timeout' });
  const stats = providerAccount.usageStats(TP);
  assert.equal(stats.total, 2);
  assert.equal(stats.success, 1);
  assert.ok(stats.cost > 0);
  assert.ok(stats.avg_latency_ms > 0);
  assert.equal(stats.by_provider.length, 1);
  providerAccount.deleteProvider(p.id, TP);
});

// ========== MARKETING AI ==========
const TM = 'tenant-cov-marketing';
clean(TM);

test('marketing createAsset, getAsset, listAssets con filtros', () => {
  const a1 = marketingAI.createAsset(TM, 'content', 'Tema 1', 'prompt1', '{"title":"Hola"}', { provider: 'test' });
  const a2 = marketingAI.createAsset(TM, 'webpage', 'Tema 2', 'prompt2', '{"headline":"Mundo"}', {});
  marketingAI.updateAssetStatus(a2.id, TM, 'published');

  assert.ok(a1.id);
  const got = marketingAI.getAsset(a1.id, TM);
  assert.equal(got.title, 'Tema 1');
  assert.equal(got.parsed.title, 'Hola');

  const all = marketingAI.listAssets(TM);
  assert.equal(all.length, 2);

  const contentOnly = marketingAI.listAssets(TM, { kind: 'content' });
  assert.equal(contentOnly.length, 1);
  assert.equal(contentOnly[0].kind, 'content');

  const publishedOnly = marketingAI.listAssets(TM, { status: 'published' });
  assert.equal(publishedOnly.length, 1);
  assert.equal(publishedOnly[0].status, 'published');
});

test('marketing campaign CRUD, attach, lead', () => {
  const c = marketingAI.createCampaign(TM, { name: 'Camp1', goal: 'leads', channels: ['email', 'social'] });
  assert.ok(c.id);
  assert.deepEqual(c.channels, ['email', 'social']);
  assert.deepEqual(c.assets, []);

  const a = marketingAI.createAsset(TM, 'content', 'X', 'p', '{}', {});
  const attached = marketingAI.attachAsset(c.id, TM, a.id);
  assert.equal(attached.assets.length, 1);

  const withLead = marketingAI.addLead(c.id, TM, { name: 'Lead1', email: 'lead@test.com' });
  assert.equal(withLead.leads.length, 1);
  assert.equal(withLead.leads[0].email, 'lead@test.com');
  assert.ok(withLead.leads[0].id);
});

// ========== LEGAL ==========
const TL = 'tenant-cov-legal';
clean(TL);

test('legal case rejection path', () => {
  const c = legalCaseService.create(TL, { title: 'Caso Reject', type: 'litigation', priority: 'alta' });
  assert.equal(c.success, true);
  db.prepare('INSERT INTO users (id, tenant_id, email, password_hash, name, role, level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('user-reject', TL, 'reject@test.com', '$2a$10$placeholderhashplaceholderhashplaceholderhashplaceholder', 'Rejecter', 'admin', 5, new Date().toISOString());
  const result = legalCaseService.approve(TL, c.case.id, { approver_id: 'user-reject', decision: 'rejected', notes: 'No procede' });
  assert.equal(result.success, true);
  const row = db.prepare('SELECT * FROM legal_approvals WHERE case_id = ? AND tenant_id = ?').get(c.case.id, TL);
  assert.ok(row);
  assert.equal(row.decision, 'rejected');
  assert.equal(row.notes, 'No procede');
});

test('legal case documents', () => {
  const c = legalCaseService.create(TL, { title: 'Caso Docs', type: 'contract', priority: 'media' });
  const result = legalCaseService.addDocument(TL, c.case.id, { filename: 'contrato.pdf', stored_name: 'store_123.pdf', doc_type: 'contract', size: 1024, ext: '.pdf', text: 'contenido' });
  assert.equal(result.success, true);
  const docsResult = legalCaseService.listDocuments(TL, c.case.id);
  assert.equal(docsResult.documents.length, 1);
  assert.equal(docsResult.documents[0].filename, 'contrato.pdf');
});

// ========== RADAR ==========
const TR = 'tenant-cov-radar';
clean(TR);

test('radar assignedRisk con agente offline/busy', () => {
  db.prepare('INSERT INTO agents (id, tenant_id, name, role, level, status, metrics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('agent-off', TR, 'Off', 'technician', 1, 'offline', '{}', new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO agents (id, tenant_id, name, role, level, status, metrics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('agent-busy', TR, 'Busy', 'technician', 1, 'busy', JSON.stringify({ burnout_risk: 'critical' }), new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, assignee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('t-off', TR, 'Offline agent ticket', 'body', 'open', 'critica', 1, 'agent-off', new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, assignee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('t-busy', TR, 'Busy agent ticket', 'body', 'open', 'alta', 1, 'agent-busy', new Date().toISOString(), new Date().toISOString());

  const radar = radarService.buildRadar({ tenant_id: TR });
  assert.ok(radar.total >= 2);
  const offItem = radar.items.find((i) => i.id === 't-off');
  const busyItem = radar.items.find((i) => i.id === 't-busy');
  assert.ok(offItem, 'offline ticket should be in radar');
  assert.ok(busyItem, 'busy ticket should be in radar');
  assert.ok(offItem.signals.assigned_risk >= 0.7, 'offline agent risk should be >= 0.7');
  assert.ok(busyItem.signals.assigned_risk >= 0.65, 'busy+burnout agent risk should be >= 0.65');
});