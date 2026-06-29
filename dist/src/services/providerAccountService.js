import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

const MASTER_KEY = process.env.AAAS_MASTER_KEY;
const SALT = process.env.AAAS_SALT || 'azurdesk-ai-salt';

if (!MASTER_KEY) {
  console.warn('[AAAS] MASTER_KEY no configurada; usando fallback inseguro. En producción setear AAAS_MASTER_KEY de 32+ caracteres.');
}
const KEY = scryptSync(MASTER_KEY || 'azurdesk-ai-master-key-change-in-prod', SALT, 32);

function encrypt(text) {
  if (!text) return { ciphertext: null, nonce: null };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, authTag]).toString('base64'), nonce: iv.toString('base64') };
}

function decrypt(ciphertext, nonce) {
  if (!ciphertext || !nonce) return null;
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = Buffer.from(nonce, 'base64');
    const authTag = buf.slice(-16);
    const data = buf.slice(0, -16);
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    console.error('AAAS decrypt error:', e.message);
    return null;
  }
}

export function createProvider(tenant_id, { name, kind, base_url, api_key, models, priority = 0, enabled = true, rate_limit_rpm, rate_limit_tpm, metadata = {} }) {
  if (!tenant_id || !name || !kind) throw new Error('tenant_id, name y kind son requeridos');
  const id = randomId('llm-provider');
  const { ciphertext, nonce } = encrypt(api_key);
  db.prepare(`INSERT INTO llm_providers (id, tenant_id, name, kind, base_url, api_key_ciphertext, api_key_nonce, models, priority, enabled, rate_limit_rpm, rate_limit_tpm, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, name, kind, base_url || null, ciphertext, nonce, JSON.stringify(models || []), priority, enabled ? 1 : 0, rate_limit_rpm || null, rate_limit_tpm || null, JSON.stringify(metadata), now(), now());
  return getProvider(id, tenant_id);
}

export function updateProvider(id, tenant_id, fields) {
  const provider = getProvider(id, tenant_id);
  if (!provider) throw new Error('Proveedor no encontrado');
  const sets = [];
  const vals = [];
  if (fields.name !== undefined) { sets.push('name=?'); vals.push(fields.name); }
  if (fields.base_url !== undefined) { sets.push('base_url=?'); vals.push(fields.base_url); }
  if (fields.api_key !== undefined) {
    const { ciphertext, nonce } = encrypt(fields.api_key);
    sets.push('api_key_ciphertext=?', 'api_key_nonce=?');
    vals.push(ciphertext, nonce);
  }
  if (fields.models !== undefined) { sets.push('models=?'); vals.push(JSON.stringify(fields.models)); }
  if (fields.priority !== undefined) { sets.push('priority=?'); vals.push(fields.priority); }
  if (fields.enabled !== undefined) { sets.push('enabled=?'); vals.push(fields.enabled ? 1 : 0); }
  if (fields.rate_limit_rpm !== undefined) { sets.push('rate_limit_rpm=?'); vals.push(fields.rate_limit_rpm); }
  if (fields.rate_limit_tpm !== undefined) { sets.push('rate_limit_tpm=?'); vals.push(fields.rate_limit_tpm); }
  if (fields.metadata !== undefined) { sets.push('metadata=?'); vals.push(JSON.stringify(fields.metadata)); }
  sets.push('updated_at=?'); vals.push(now());
  vals.push(id, tenant_id);
  db.prepare(`UPDATE llm_providers SET ${sets.join(', ')} WHERE id=? AND tenant_id=?`).run(...vals);
  return getProvider(id, tenant_id);
}

export function getProvider(id, tenant_id) {
  const row = db.prepare('SELECT * FROM llm_providers WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  if (!row) return null;
  return rowToProvider(row);
}

export function listProviders(tenant_id) {
  return db.prepare('SELECT * FROM llm_providers WHERE tenant_id = ? ORDER BY priority DESC, created_at ASC').all(tenant_id).map(rowToProvider);
}

export function deleteProvider(id, tenant_id) {
  const result = db.prepare('DELETE FROM llm_providers WHERE id = ? AND tenant_id = ?').run(id, tenant_id);
  return result.changes > 0;
}

export function getDecryptedKey(id, tenant_id) {
  const row = db.prepare('SELECT api_key_ciphertext, api_key_nonce FROM llm_providers WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  if (!row) return null;
  return decrypt(row.api_key_ciphertext, row.api_key_nonce);
}

function rowToProvider(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    kind: row.kind,
    base_url: row.base_url,
    models: safeJson(row.models, []),
    priority: row.priority,
    enabled: row.enabled === 1,
    rate_limit_rpm: row.rate_limit_rpm,
    rate_limit_tpm: row.rate_limit_tpm,
    status: row.status,
    last_check_at: row.last_check_at,
    metadata: safeJson(row.metadata, {}),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function logUsage({ tenant_id, provider_id, model, operation, input_tokens = 0, output_tokens = 0, cost_usd = 0, latency_ms = 0, success = true, error = null }) {
  const id = randomId('usage');
  db.prepare(`INSERT INTO llm_usage_logs (id, tenant_id, provider_id, model, operation, input_tokens, output_tokens, cost_usd, latency_ms, success, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, provider_id, model, operation, input_tokens, output_tokens, cost_usd, latency_ms, success ? 1 : 0, error, now());
  return id;
}

export function usageStats(tenant_id) {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success,
      COALESCE(SUM(cost_usd), 0) as cost,
      COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM llm_usage_logs WHERE tenant_id = ?
  `).get(tenant_id);
  const byProvider = db.prepare(`SELECT provider_id, COUNT(*) as calls, SUM(cost_usd) as cost, AVG(latency_ms) as avg_latency
    FROM llm_usage_logs WHERE tenant_id = ? GROUP BY provider_id`).all(tenant_id);
  return { total: row.total, success: row.success, cost: Math.round(row.cost * 10000) / 10000, avg_latency_ms: Math.round(row.avg_latency), by_provider: byProvider };
}

export default { createProvider, updateProvider, getProvider, listProviders, deleteProvider, getDecryptedKey, logUsage, usageStats };
