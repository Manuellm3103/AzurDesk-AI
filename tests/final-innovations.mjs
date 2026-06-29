import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import analyticsService from '../src/services/analyticsService.js';
import promptOptimizationService from '../src/services/promptOptimizationService.js';
import assetService from '../src/services/assetService.js';
import rbacService from '../src/services/rbacService.js';

const T = `tenant-final-${Date.now()}`;

function clean() {
  db.prepare('DELETE FROM llm_metrics WHERE tenant_id = ?').run(T);
  db.prepare('DELETE FROM prompt_variants WHERE template_id LIKE ?').run(`%${T}%`);
  db.prepare('DELETE FROM tenant_assets WHERE tenant_id = ?').run(T);
  db.prepare('DELETE FROM tenant_quotas WHERE tenant_id = ?').run(T);
}

test('analytics: record and summarize metrics', () => {
  clean();
  analyticsService.recordMetric({ tenant_id: T, provider: 'ollama', model: 'mistral', prompt_tokens: 100, completion_tokens: 50, cost_usd: 0.01, latency_ms: 200 });
  analyticsService.recordMetric({ tenant_id: T, provider: 'ollama', model: 'mistral', prompt_tokens: 200, completion_tokens: 100, cost_usd: 0.02, latency_ms: 300 });
  const summary = analyticsService.getTenantSummary(T, '7d');
  assert.equal(summary.totals.requests, 2);
  assert.equal(summary.totals.tokens, 450);
  assert.equal(summary.totals.cost, 0.03);
  assert.equal(summary.by_model.length, 1);
  clean();
});

test('prompt optimization: create, pick, feedback', () => {
  clean();
  const tid = `template-${T}`;
  const v1 = promptOptimizationService.createVariant(tid, 'A', 'Prompt A');
  const v2 = promptOptimizationService.createVariant(tid, 'B', 'Prompt B');
  assert.ok(v1.id);
  assert.equal(v1.score, 0);

  promptOptimizationService.recordUsage(v1.id);
  promptOptimizationService.recordUsage(v1.id);
  promptOptimizationService.recordUsage(v1.id);
  promptOptimizationService.recordFeedback(v1.id, 5);

  promptOptimizationService.recordUsage(v2.id);
  promptOptimizationService.recordUsage(v2.id);
  promptOptimizationService.recordUsage(v2.id);
  promptOptimizationService.recordFeedback(v2.id, 3);

  const best = promptOptimizationService.getBestVariant(tid);
  assert.equal(best.id, v1.id);
  assert.ok(best.score > v2.score);
  clean();
});

test('assets: upload respects quota and deletes', async () => {
  clean();
  db.prepare('INSERT OR REPLACE INTO tenant_quotas (id, tenant_id, max_storage_mb, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(`quota-${T}`, T, 1, new Date().toISOString(), new Date().toISOString());

  const asset = await assetService.upload(T, 'hello.txt', Buffer.from('world'));
  assert.ok(asset.id);
  assert.equal(asset.size_bytes, 5);

  const list = assetService.listAssets(T);
  assert.equal(list.length, 1);

  const stats = assetService.getStorageStats(T);
  assert.equal(stats.used_bytes, 5);
  assert.equal(stats.files, 1);

  await assetService.deleteAsset(asset.id, T);
  assert.equal(assetService.listAssets(T).length, 0);
  clean();
});

test('assets: quota exceeded throws', async () => {
  clean();
  db.prepare('INSERT OR REPLACE INTO tenant_quotas (id, tenant_id, max_storage_mb, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(`quota-${T}`, T, 0, new Date().toISOString(), new Date().toISOString());
  try {
    await assetService.upload(T, 'big.txt', Buffer.alloc(1024 * 1024));
    assert.fail('Debería lanzar error de quota');
  } catch (e) {
    assert.ok(e.message.includes('Quota'));
  }
  clean();
});

test('rbac: admin puede todo, viewer solo leer', () => {
  const admin = { role: 'admin' };
  const viewer = { role: 'viewer' };
  assert.equal(rbacService.can(admin, 'billing', 'write'), true);
  assert.equal(rbacService.can(viewer, 'tickets', 'read'), true);
  assert.equal(rbacService.can(viewer, 'tickets', 'write'), false);
  assert.equal(rbacService.can({ role: 'superadmin' }, 'anything', 'write'), true);
});

test('rbac: grant/revoke custom permission', () => {
  rbacService.grantPermission('custom_role', 'custom_resource', 'custom_action');
  assert.equal(rbacService.can({ role: 'custom_role' }, 'custom_resource', 'custom_action'), true);
  rbacService.revokePermission('custom_role', 'custom_resource', 'custom_action');
  assert.equal(rbacService.can({ role: 'custom_role' }, 'custom_resource', 'custom_action'), false);
});