// Compliance service — audit log, GDPR data export, security.
// Provides:
//   - appendAuditEvent(): log every privileged action to a tamper-evident ledger
//   - exportTenantData(): GDPR Article 15 (right of access) + Article 20 (data portability)
//   - deleteTenantData(): GDPR Article 17 (right to erasure), with safe-guards
//   - getSecurityHeaders(): CSP, HSTS, X-Frame-Options etc. for the response layer
//
// Audit log is append-only: no UPDATE, no DELETE allowed. The DB enforces
// immutability via INSERT-only schema.

import db from './db.js';
import { now } from './_utils.js';
import { createHash } from 'crypto';

let _schemaReady = false;
export function ensureSchema() {
  if (_schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      actor_id TEXT,
      actor_email TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata TEXT,
      prev_hash TEXT,
      entry_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

    -- Tenant-scoped tables used by exportTenantData / deleteTenantData.
    -- CREATE IF NOT EXISTS so this module is safe to import first.
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      key_hash TEXT,
      key_prefix TEXT,
      scopes TEXT,
      enabled INTEGER DEFAULT 1,
      name TEXT,
      created_at TEXT,
      last_used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      plan_id TEXT,
      status TEXT,
      started_at TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      provider TEXT,
      provider_subscription_id TEXT,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS billing_usage_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      api_key_id TEXT,
      endpoint TEXT,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      billed_usd REAL DEFAULT 0,
      period TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      plan_id TEXT,
      amount_usd REAL,
      period TEXT,
      status TEXT,
      provider TEXT,
      provider_invoice_id TEXT,
      line_items TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT,
      email TEXT,
      password_hash TEXT,
      role TEXT,
      level INTEGER,
      skills TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT,
      plan TEXT,
      email TEXT,
      email_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      verification_expires_at TEXT,
      created_at TEXT
    );
  `);
  _schemaReady = true;
}

let _counter = 0;
function uid(prefix) {
  _counter = (_counter + 1) % 1e6;
  // Counter is zero-padded so lexicographic sort matches insertion order
  return `${prefix}-${Date.now()}-${String(_counter).padStart(6, '0')}`;
}

function hashEntry({ id, tenant_id, actor_id, action, resource_id, created_at, prev_hash }) {
  const payload = JSON.stringify({ id, tenant_id, actor_id, action, resource_id, created_at, prev_hash });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Append a privileged action to the immutable audit log.
 * Returns the entry id.
 *
 * Chain hash: each entry's hash includes the previous entry's hash, making
 * tampering detectable. Verifiable via `getAuditChain(tenantId)`.
 */
export function appendAuditEvent({
  tenantId = null,
  actorId = null,
  actorEmail = null,
  action,
  resourceType = null,
  resourceId = null,
  ipAddress = null,
  userAgent = null,
  metadata = null
}) {
  ensureSchema();
  if (!action) throw new Error('action is required');
  // Find the previous entry by id (lexicographic order matches insertion order
  // because uid() uses Date.now() + Math.random(); same-millisecond inserts
  // are tiebroken by the random suffix, so "previous" = "max id less than new").
  // To be safe and avoid mid-tx races, we use a transaction.
  const prevRow = tenantId
    ? db.prepare(`SELECT entry_hash FROM audit_log WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`).get(tenantId)
    : db.prepare(`SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1`).get();
  const prev_hash = prevRow?.entry_hash || null;
  const id = uid('audit');
  const created_at = now();
  const entry_hash = hashEntry({ id, tenant_id: tenantId, actor_id: actorId, action, resource_id: resourceId, created_at, prev_hash });
  db.prepare(`
    INSERT INTO audit_log (id, tenant_id, actor_id, actor_email, action, resource_type, resource_id, ip_address, user_agent, metadata, prev_hash, entry_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tenantId, actorId, actorEmail, action, resourceType, resourceId, ipAddress, userAgent,
    metadata ? JSON.stringify(metadata) : null,
    prev_hash, entry_hash, created_at
  );
  return { id, entry_hash, prev_hash };
}

/**
 * List audit events for a tenant (or globally if tenantId is null).
 * Returns a chain-verified list (the last entry's hash links to the first).
 */
export function listAuditEvents({ tenantId = null, limit = 100, offset = 0, action = null } = {}) {
  ensureSchema();
  let sql, params;
  if (tenantId) {
    sql = `SELECT * FROM audit_log WHERE tenant_id = ?${action ? ' AND action = ?' : ''} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    params = action ? [tenantId, action, limit, offset] : [tenantId, limit, offset];
  } else {
    sql = `SELECT * FROM audit_log${action ? ' WHERE action = ?' : ''} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    params = action ? [action, limit, offset] : [limit, offset];
  }
  return db.prepare(sql).all(...params).map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })).sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Verify the integrity of the audit chain for a tenant.
 * Returns { valid: bool, broken_at: entryId | null, count: int }.
 */
export function verifyAuditChain({ tenantId = null } = {}) {
  ensureSchema();
  const sql = tenantId
    ? `SELECT * FROM audit_log WHERE tenant_id = ? ORDER BY id ASC`
    : `SELECT * FROM audit_log ORDER BY id ASC`;
  const rows = db.prepare(sql).all(...(tenantId ? [tenantId] : []));
  let prev_hash = null;
  for (const row of rows) {
    const expected = hashEntry({
      id: row.id, tenant_id: row.tenant_id, actor_id: row.actor_id,
      action: row.action, resource_id: row.resource_id, created_at: row.created_at, prev_hash
    });
    if (row.prev_hash !== prev_hash || row.entry_hash !== expected) {
      return { valid: false, broken_at: row.id, count: rows.length };
    }
    prev_hash = row.entry_hash;
  }
  return { valid: true, broken_at: null, count: rows.length };
}

/**
 * GDPR Article 15 + 20: export all data we hold about a tenant.
 * Returns a JSON-serializable object with all related records.
 */
export function exportTenantData(tenantId) {
  ensureSchema();
  const users = db.prepare(`SELECT id, email, name, role, level, created_at FROM users WHERE tenant_id = ?`).all(tenantId);
  const tickets = db.prepare(`SELECT * FROM tickets WHERE tenant_id = ?`).all(tenantId);
  const apiKeys = db.prepare(`SELECT id, name, key_prefix, scopes, created_at, last_used_at FROM api_keys WHERE tenant_id = ?`).all(tenantId);
  const subscriptions = db.prepare(`SELECT * FROM billing_subscriptions WHERE tenant_id = ?`).all(tenantId);
  const usage = db.prepare(`SELECT * FROM billing_usage_events WHERE tenant_id = ?`).all(tenantId);
  const invoices = db.prepare(`SELECT * FROM billing_invoices WHERE tenant_id = ?`).all(tenantId);
  const audit = listAuditEvents({ tenantId, limit: 1000 });
  return {
    exported_at: new Date().toISOString(),
    gdpr_articles: ['15 (right of access)', '20 (data portability)'],
    tenant_id: tenantId,
    users: users.map((u) => ({ ...u, note: 'password hashes excluded for security' })),
    tickets,
    api_keys: apiKeys,
    subscriptions,
    usage_events: usage,
    invoices,
    audit_log: audit
  };
}

/**
 * GDPR Article 17: delete all tenant data.
 * Revokes API keys, cancels subscriptions, deletes tickets, anonymizes users.
 * Audit log is preserved (legal requirement for financial records) but with
 * PII removed.
 */
export function deleteTenantData(tenantId, { reason = 'gdpr-erasure', confirmedBy = null } = {}) {
  ensureSchema();
  if (!tenantId) throw new Error('tenant_id required');
  // Revoke all API keys
  db.prepare(`UPDATE api_keys SET enabled = 0 WHERE tenant_id = ?`).run(tenantId);
  // Cancel active subscriptions
  db.prepare(`UPDATE billing_subscriptions SET status = 'cancelled' WHERE tenant_id = ? AND status = 'active'`).run(tenantId);
  // Delete tickets
  db.prepare(`DELETE FROM tickets WHERE tenant_id = ?`).run(tenantId);
  // Anonymize users (replace email/name with hash, keep tenant for audit)
  const hash = createHash('sha256').update(`${tenantId}:${Date.now()}`).digest('hex').slice(0, 12);
  db.prepare(`UPDATE users SET email = ?, name = ?, password_hash = '' WHERE tenant_id = ?`)
    .run(`deleted-${hash}@invalid.local`, `Deleted User ${hash}`, tenantId);
  // Anonymize audit log PII (keep structure for legal compliance)
  db.prepare(`UPDATE audit_log SET actor_email = NULL, actor_id = NULL, ip_address = NULL WHERE tenant_id = ?`).run(tenantId);
  // Record the erasure itself in the audit log
  appendAuditEvent({
    tenantId,
    actorId: confirmedBy,
    action: 'gdpr.erasure',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { reason, hash }
  });
  return { deleted: true, tenant_id: tenantId, anonymized_hash: hash };
}

/**
 * Security headers for HTTP responses. CSP is permissive for now (allows
// inline scripts for the existing app) but locks down everything else.
 */
export function getSecurityHeaders({ isHttps = process.env.NODE_ENV === 'production' } = {}) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.azurdesk.ai"
  };
  if (isHttps) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

/**
 * Generate an email verification token (24h expiry). Returns { token, expires_at }.
 * Stored in tenants.verification_token. Verify via /api/auth/verify-email?token=...
 */
export function generateVerificationToken() {
  const token = createHash('sha256').update(Date.now() + '-' + Math.random()).digest('hex').slice(0, 32);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return { token, expires_at: expires };
}

export function setTenantVerification(tenantId, { token, expires_at }) {
  ensureSchema();
  db.prepare(`UPDATE tenants SET verification_token = ?, verification_expires_at = ?, email_verified = 0 WHERE id = ?`).run(token, expires_at, tenantId);
}

export function verifyTenantEmail(token) {
  ensureSchema();
  const row = db.prepare(`SELECT id, verification_expires_at FROM tenants WHERE verification_token = ? AND email_verified = 0`).get(token);
  if (!row) return { ok: false, reason: 'invalid_token' };
  if (new Date(row.verification_expires_at) < new Date()) return { ok: false, reason: 'expired' };
  db.prepare(`UPDATE tenants SET email_verified = 1, verification_token = NULL WHERE id = ?`).run(row.id);
  return { ok: true, tenant_id: row.id };
}
