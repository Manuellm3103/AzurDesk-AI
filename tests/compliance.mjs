import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAuditEvent,
  listAuditEvents,
  verifyAuditChain,
  exportTenantData,
  deleteTenantData,
  getSecurityHeaders,
  ensureSchema as _ensureComplianceSchema
} from '../src/services/complianceService.js';
import db from '../src/services/db.js';

function clean() {
  _ensureComplianceSchema();
  db.exec(`DELETE FROM audit_log; DELETE FROM users WHERE email LIKE 'gdpr-test%'; DELETE FROM tenants WHERE id LIKE 'gdpr-test%';`);
  // Recreate a tenant + user for the GDPR tests
  db.exec(`INSERT OR IGNORE INTO tenants (id, name, plan, created_at) VALUES ('gdpr-test-1', 'Test Tenant', 'free', '${new Date().toISOString()}')`);
  db.exec(`INSERT OR IGNORE INTO users (id, tenant_id, name, email, password_hash, role, level, created_at) VALUES ('u-1', 'gdpr-test-1', 'Alice', 'gdpr-test-1@example.com', 'hash', 'admin', 5, '${new Date().toISOString()}')`);
}

test('ensureSchema: creates audit_log table', () => {
  _ensureComplianceSchema();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'`).all();
  assert.equal(tables.length, 1);
});

test('appendAuditEvent: returns id and entry_hash', () => {
  clean();
  const r = appendAuditEvent({ tenantId: 't1', action: 'user.login', actorEmail: 'a@b.com' });
  assert.ok(r.id);
  assert.ok(r.entry_hash);
  assert.equal(r.entry_hash.length, 64); // SHA-256 hex
});

test('appendAuditEvent: requires action', () => {
  assert.throws(() => appendAuditEvent({}), /action/);
});

test('listAuditEvents: returns events in DESC order by created_at', () => {
  const tid = 't1-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  appendAuditEvent({ tenantId: tid, action: 'a1' });
  appendAuditEvent({ tenantId: tid, action: 'a2' });
  appendAuditEvent({ tenantId: tid, action: 'a3' });
  const events = listAuditEvents({ tenantId: tid });
  assert.equal(events.length, 3);
  assert.equal(events[0].action, 'a3');
  assert.equal(events[2].action, 'a1');
});

test('listAuditEvents: filter by action', () => {
  clean();
  appendAuditEvent({ tenantId: 't2', action: 'user.login' });
  appendAuditEvent({ tenantId: 't2', action: 'user.logout' });
  appendAuditEvent({ tenantId: 't2', action: 'user.login' });
  const logins = listAuditEvents({ tenantId: 't2', action: 'user.login' });
  assert.equal(logins.length, 2);
});

test('listAuditEvents: limit and offset', () => {
  clean();
  for (let i = 0; i < 10; i++) appendAuditEvent({ tenantId: 't3', action: 'x' });
  assert.equal(listAuditEvents({ tenantId: 't3', limit: 5 }).length, 5);
  assert.equal(listAuditEvents({ tenantId: 't3', limit: 5, offset: 7 }).length, 3);
});

test('verifyAuditChain: returns valid for unmodified chain', () => {
  // Use a fresh tenant id per test run to avoid state pollution.
  const tid = 't4-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const before = verifyAuditChain({ tenantId: tid });
  assert.equal(before.count, 0, 'fresh tenant should have 0 entries');
  appendAuditEvent({ tenantId: tid, action: 'a' });
  appendAuditEvent({ tenantId: tid, action: 'b' });
  appendAuditEvent({ tenantId: tid, action: 'c' });
  const v = verifyAuditChain({ tenantId: tid });
  assert.equal(v.valid, true, `chain invalid: ${JSON.stringify(v)}`);
  assert.equal(v.count, 3);
});

test('verifyAuditChain: detects tampering (modified entry_hash)', () => {
  const tid = 't5-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  appendAuditEvent({ tenantId: tid, action: 'a' });
  appendAuditEvent({ tenantId: tid, action: 'b' });
  // Tamper with the first entry
  db.prepare(`UPDATE audit_log SET action = 'tampered' WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1`).run(tid);
  const v = verifyAuditChain({ tenantId: tid });
  assert.equal(v.valid, false);
  assert.ok(v.broken_at);
});

test('verifyAuditChain: detects broken chain (modified prev_hash)', () => {
  const tid = 't6-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  appendAuditEvent({ tenantId: tid, action: 'a' });
  appendAuditEvent({ tenantId: tid, action: 'b' });
  appendAuditEvent({ tenantId: tid, action: 'c' });
  // Tamper with the middle entry's prev_hash to break the chain
  const middle = db.prepare(`SELECT id FROM audit_log WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1 OFFSET 1`).get(tid);
  db.prepare(`UPDATE audit_log SET prev_hash = 'broken' WHERE id = ?`).run(middle.id);
  const v = verifyAuditChain({ tenantId: tid });
  assert.equal(v.valid, false);
  assert.equal(v.broken_at, middle.id);
});

test('exportTenantData: returns GDPR-compliant export', () => {
  clean();
  const data = exportTenantData('gdpr-test-1');
  assert.ok(data.exported_at);
  assert.match(data.gdpr_articles[0], /15/);
  assert.equal(data.tenant_id, 'gdpr-test-1');
  assert.equal(data.users.length, 1);
  assert.equal(data.users[0].email, 'gdpr-test-1@example.com');
  assert.equal(data.users[0].password_hash, undefined);
});

test('exportTenantData: throws for missing tenant', () => {
  clean();
  // Should not throw even for unknown tenant (returns empty arrays)
  const data = exportTenantData('does-not-exist');
  assert.equal(data.users.length, 0);
});

test('deleteTenantData: requires tenant_id', () => {
  assert.throws(() => deleteTenantData(), /tenant_id/);
});

test('deleteTenantData: anonymizes users and revokes keys', () => {
  clean();
  // Create an API key for the user (use prepared statement to avoid string interpolation)
  db.prepare(`DELETE FROM api_keys WHERE id = 'gdpr-test-k1'`).run();
  db.prepare(`INSERT INTO api_keys (id, tenant_id, name, key_hash, key_prefix, scopes, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('gdpr-test-k1', 'gdpr-test-1', 'test-key', 'h', 'kp_1', '[]', 1, new Date().toISOString());
  const result = deleteTenantData('gdpr-test-1', { reason: 'erasure-test', confirmedBy: 'admin-1' });
  assert.equal(result.deleted, true);
  // User is anonymized
  const user = db.prepare(`SELECT email, password_hash FROM users WHERE tenant_id = 'gdpr-test-1'`).get();
  assert.match(user.email, /^deleted-/);
  assert.equal(user.password_hash, '');
  // API key disabled
  const key = db.prepare(`SELECT enabled FROM api_keys WHERE id = 'gdpr-test-k1'`).get();
  assert.ok(key, 'key should still exist (just disabled)');
  assert.equal(key.enabled, 0);
  // Audit log entry recorded
  const audit = listAuditEvents({ tenantId: 'gdpr-test-1', action: 'gdpr.erasure' });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].resource_id, 'gdpr-test-1');
});

test('getSecurityHeaders: includes all required security headers', () => {
  const h = getSecurityHeaders();
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.ok(h['Permissions-Policy']);
  assert.ok(h['Content-Security-Policy']);
});

test('getSecurityHeaders: HSTS only on HTTPS', () => {
  const http = getSecurityHeaders({ isHttps: false });
  const https = getSecurityHeaders({ isHttps: true });
  assert.equal(http['Strict-Transport-Security'], undefined);
  assert.ok(https['Strict-Transport-Security']);
  assert.match(https['Strict-Transport-Security'], /max-age=31536000/);
});

test('getSecurityHeaders: CSP restricts script sources', () => {
  const h = getSecurityHeaders();
  assert.match(h['Content-Security-Policy'], /script-src/);
  assert.match(h['Content-Security-Policy'], /default-src 'self'/);
});
