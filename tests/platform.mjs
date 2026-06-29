import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import * as apiKeyService from '../src/services/apiKeyService.js';
import auditService from '../src/services/auditService.js';
import quotaService from '../src/services/quotaService.js';
import openApiService from '../src/services/openApiService.js';

const T = 'tenant-platform-test';

function clean() {
  for (const t of ['api_keys', 'audit_logs', 'tenant_quotas']) {
    try { db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(T); } catch {}
  }
}

test('API Key create → validate → list → revoke', () => {
  clean();
  const created = apiKeyService.createApiKey(T, { name: 'Test Key', scopes: ['read', 'write'] });
  assert.ok(created.key.startsWith('azdk_'));
  assert.ok(created.id);
  assert.deepEqual(created.scopes, ['read', 'write']);

  const validated = apiKeyService.validateApiKey(created.key);
  assert.ok(validated);
  assert.equal(validated.tenant_id, T);
  assert.equal(validated.is_api_key, true);
  assert.deepEqual(validated.scopes, ['read', 'write']);

  const list = apiKeyService.listApiKeys(T);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Test Key');
  assert.equal(list[0].enabled, true);
  assert.equal(list[0].key_hash, undefined); // no leak

  const revoked = apiKeyService.revokeApiKey(created.id, T);
  assert.equal(revoked, true);
  const revokedValidated = apiKeyService.validateApiKey(created.key);
  assert.equal(revokedValidated, null);
});

test('API Key expired returns null', () => {
  clean();
  const created = apiKeyService.createApiKey(T, { name: 'Expired', expires_at: '2020-01-01T00:00:00Z' });
  assert.equal(apiKeyService.validateApiKey(created.key), null);
});

test('API Key invalid prefix returns null', () => {
  assert.equal(apiKeyService.validateApiKey('invalid_key'), null);
  assert.equal(apiKeyService.validateApiKey(null), null);
  assert.equal(apiKeyService.validateApiKey(''), null);
});

test('requireScope allows wildcard', () => {
  assert.equal(apiKeyService.requireScope({ is_api_key: true, scopes: ['*'] }, 'write'), true);
  assert.equal(apiKeyService.requireScope({ is_api_key: true, scopes: ['read'] }, 'write'), false);
  assert.equal(apiKeyService.requireScope({ is_api_key: false, scopes: ['read'] }, 'write'), true);
});

test('Audit log create → list → count', () => {
  clean();
  const id1 = auditService.log({ tenant_id: T, actor_id: 'user1', action: 'ticket.create', resource_type: 'ticket', details: { subject: 'Test' } });
  const id2 = auditService.log({ tenant_id: T, actor_id: 'user1', action: 'ticket.escalate', resource_type: 'ticket', details: { id: 't1' } });
  assert.ok(id1);
  assert.ok(id2);

  const logs = auditService.listLogs(T);
  assert.equal(logs.length, 2);
  assert.ok(['ticket.create', 'ticket.escalate'].includes(logs[0].action));

  const filtered = auditService.listLogs(T, { action: 'ticket.create' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].details.subject, 'Test');

  assert.equal(auditService.countByAction(T, 'ticket.create'), 1);
});

test('Quota getOrCreate, update, usage', () => {
  clean();
  const q = quotaService.getQuota(T);
  assert.ok(q);
  assert.equal(q.max_llm_calls_per_day, 1000);

  const updated = quotaService.updateQuota(T, { max_llm_calls_per_day: 5000, max_llm_cost_per_day: 50.0 });
  assert.equal(updated.max_llm_calls_per_day, 5000);
  assert.equal(updated.max_llm_cost_per_day, 50.0);

  const allowed = quotaService.checkLlmAllowed(T);
  assert.equal(allowed, true);

  quotaService.recordLlmUsage(T, 0.05);
  const summary = quotaService.getUsageSummary(T);
  assert.equal(summary.llm_calls_today, 1);
  assert.ok(summary.llm_cost_today >= 0.05);
  assert.equal(summary.remaining_calls, 4999);
});

test('OpenAPI spec builds with paths', () => {
  const spec = openApiService.buildSpec();
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(Object.keys(spec.paths).length > 20);
  assert.ok(spec.paths['/health']);
  assert.ok(spec.paths['/tickets']);
  assert.ok(spec.paths['/aaas/generate']);
  assert.ok(spec.components.securitySchemes.bearerAuth);
});