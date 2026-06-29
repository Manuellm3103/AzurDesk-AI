import { randomBytes, createHash } from 'crypto';
import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

const PREFIX = 'azdk';

function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

export function createApiKey(tenant_id, { name, scopes = ['read'], expires_at = null }) {
  if (!tenant_id || !name) throw new Error('tenant_id y name requeridos');
  const rawKey = `${PREFIX}_${randomBytes(24).toString('hex')}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);
  const id = randomId('apikey');
  db.prepare(`INSERT INTO api_keys (id, tenant_id, name, key_hash, key_prefix, scopes, expires_at, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(id, tenant_id, name, keyHash, keyPrefix, JSON.stringify(scopes), expires_at, now());
  return { id, name, key: rawKey, key_prefix: keyPrefix, scopes, expires_at, created_at: now() };
}

export function validateApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith(PREFIX + '_')) return null;
  const keyHash = hashKey(rawKey);
  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1').get(keyHash);
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now(), row.id);
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    scopes: safeJson(row.scopes, ['read']),
    is_api_key: true
  };
}

export function listApiKeys(tenant_id) {
  return db.prepare('SELECT id, tenant_id, name, key_prefix, scopes, last_used_at, expires_at, enabled, created_at, revoked_at FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC').all(tenant_id)
    .map((r) => ({ ...r, scopes: safeJson(r.scopes, ['read']), enabled: r.enabled === 1 }));
}

export function revokeApiKey(id, tenant_id) {
  const result = db.prepare('UPDATE api_keys SET enabled = 0, revoked_at = ? WHERE id = ? AND tenant_id = ?').run(now(), id, tenant_id);
  return result.changes > 0;
}

export function deleteApiKey(id, tenant_id) {
  const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND tenant_id = ?').run(id, tenant_id);
  return result.changes > 0;
}

export function requireScope(user, scope) {
  if (!user || !user.is_api_key) return true;
  if (!user.scopes) return false;
  return user.scopes.includes(scope) || user.scopes.includes('*');
}

export default { createApiKey, validateApiKey, listApiKeys, revokeApiKey, deleteApiKey, requireScope };