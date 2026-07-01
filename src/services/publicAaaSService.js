// Public AaaS API — /v1/* endpoints for external developers.
// Auth: Bearer API key (sk_live_/sk_test_) via X-API-Key or Authorization header.
// Rate limit: per API key, per minute. Quota: per API key, per month.
//
// Mirror of the internal /api/aaas/* surface, exposed for paying external
// customers. The internal endpoints remain for the in-app UI; this is the
// commercial surface that powers third-party integrations.

import { validateApiKey, listApiKeys } from './apiKeyService.js';
import { fetch } from 'undici';

// In-memory rate limit + quota store. For multi-instance prod, swap to Redis.
const _rateLimit = new Map(); // key = `apiKeyId:minute` -> { count, resetAt }
const _quota = new Map();     // key = apiKeyId -> { used, periodStart }
export const RATE_PER_MINUTE = 60;
export const QUOTA_PER_MONTH = 100_000;

// Plan-specific overrides (set by setRateLimitsForTenant). When a tenant is
// subscribed to a paid plan, their rate limits and quota are elevated.
const _tenantLimits = new Map(); // tenantId -> { ratePerMinute, quotaPerMonth }
export function setRateLimitsForTenant(tenantId, { ratePerMinute, quotaPerMonth }) {
  _tenantLimits.set(tenantId, { ratePerMinute, quotaPerMonth });
}
export function clearRateLimitsForTenant(tenantId) {
  _tenantLimits.delete(tenantId);
}

export function checkRateLimit(apiKeyId, { tenantId } = {}) {
  // Plan-specific override: paid tenants get higher rate caps
  const rateCap = _tenantLimits.get(tenantId)?.ratePerMinute ?? RATE_PER_MINUTE;
  const minute = Math.floor(Date.now() / 60_000);
  const k = `${apiKeyId}:${minute}`;
  const slot = _rateLimit.get(k) || { count: 0 };
  slot.count += 1;
  _rateLimit.set(k, slot);
  if (slot.count > rateCap) {
    return { allowed: false, retryAfter: 60, remaining: 0, limit: rateCap };
  }
  return { allowed: true, remaining: rateCap - slot.count, limit: rateCap };
}

export function checkQuota(apiKeyId, { tenantId } = {}) {
  // Plan-specific override: paid tenants get higher monthly quotas
  const quotaCap = _tenantLimits.get(tenantId)?.quotaPerMonth ?? QUOTA_PER_MONTH;
  const month = new Date().toISOString().slice(0, 7);
  const slot = _quota.get(apiKeyId) || { used: 0, periodStart: month };
  if (slot.periodStart !== month) {
    slot.used = 0;
    slot.periodStart = month;
  }
  slot.used += 1;
  _quota.set(apiKeyId, slot);
  if (slot.used > quotaCap) {
    return { allowed: false, used: slot.used, limit: quotaCap };
  }
  return { allowed: true, used: slot.used, limit: quotaCap };
}

/**
 * Authenticate a public API key from the request. Returns { ok, ctx, error }.
 * ctx = { tenantId, apiKeyId, scopes, keyPrefix } on success.
 */
export async function authenticatePublicRequest({ headers, body }) {
  const auth = headers.get?.('authorization') || headers.authorization || '';
  const headerKey = headers.get?.('x-api-key') || headers['x-api-key'] || '';
  let raw = '';
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) raw = auth.slice(7).trim();
  else if (typeof auth === 'string' && auth.startsWith('bearer ')) raw = auth.slice(7).trim();
  if (!raw && headerKey) raw = String(headerKey).trim();
  if (!raw) return { ok: false, error: 'missing_api_key' };
  // Validate against DB-backed apiKeyService
  const result = validateApiKey(raw);
  if (!result) return { ok: false, error: 'invalid_api_key' };
  // Lookup the key_prefix for rate-limit response headers (best-effort)
  let keyPrefix = '';
  try {
    const { listApiKeys } = await import('./apiKeyService.js');
    const all = listApiKeys(result.tenant_id);
    const found = all.find((k) => k.id === result.id);
    keyPrefix = found?.key_prefix || '';
  } catch { /* ignore */ }
  const row = { ...result, key_prefix: keyPrefix };
  // Rate limit + quota (with plan-specific overrides)
  const rl = checkRateLimit(row.id, { tenantId: row.tenant_id });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfter: rl.retryAfter };
  const q = checkQuota(row.id, { tenantId: row.tenant_id });
  if (!q.allowed) return { ok: false, error: 'quota_exceeded', quota: q };
  return {
    ok: true,
    ctx: {
      tenantId: row.tenant_id,
      apiKeyId: row.id,
      keyPrefix: row.key_prefix,
      scopes: Array.isArray(row.scopes) ? row.scopes : (typeof row.scopes === 'string' ? JSON.parse(row.scopes) : []),
      rate: rl,
      quota: q
    }
  };
}

/**
 * Generate a public API key. Format: sk_live_<prefix>_<secret> or sk_test_<prefix>_<secret>.
 * Returns the raw key (only shown once) plus the persisted id.
 */
export async function createPublicApiKey(tenant_id, { name, environment = 'live', scopes = ['aaas:read', 'aaas:write'] } = {}) {
  if (!tenant_id) throw new Error('tenant_id required');
  if (!['live', 'test'].includes(environment)) throw new Error('environment must be live|test');
  const { createApiKey } = await import('./apiKeyService.js');
  return await createApiKey(tenant_id, { name, scopes });
}

/**
 * Build a public v1 request handler. Wraps an internal AAAS handler and:
 * - authenticates via API key
 * - records usage (for billing)
 * - normalizes response shape to v1 conventions (snake_case, version, rate headers)
 */
export function wrapAsV1Endpoint(internalHandler) {
  return async (req, ctx) => {
    const auth = await authenticatePublicRequest({ headers: req.headers });
    if (!auth.ok) {
      return { status: auth.error === 'rate_limited' ? 429 : auth.error === 'quota_exceeded' ? 402 : 401, body: { error: auth.error, message: `Public API: ${auth.error}` } };
    }
    try {
      const out = await internalHandler({ ...ctx, tenantId: auth.ctx.tenantId, apiKeyId: auth.ctx.apiKeyId }, req);
      const headers = {
        'X-RateLimit-Limit': String(auth.ctx.rate.limit),
        'X-RateLimit-Remaining': String(auth.ctx.rate.remaining),
        'X-Quota-Used': String(auth.ctx.quota.used),
        'X-Quota-Limit': String(auth.ctx.quota.limit),
        'X-API-Key-Prefix': auth.ctx.keyPrefix
      };
      return { status: out.status || 200, body: { ...(out.body || {}), api_version: 'v1' }, headers };
    } catch (e) {
      return { status: 500, body: { error: 'internal_error', message: e.message } };
    }
  };
}

/**
 * Health check for public AaaS API (no auth required, rate limited).
 */
export async function publicHealth() {
  return { status: 'ok', api: 'aaas', version: '1.0.0', environment: 'live' };
}

/**
 * Public usage stats for a tenant. Returns quota consumption.
 */
export function publicUsage(apiKeyId) {
  const month = new Date().toISOString().slice(0, 7);
  const slot = _quota.get(apiKeyId) || { used: 0, periodStart: month };
  return {
    api_key_id: apiKeyId,
    period: slot.periodStart,
    used: slot.used,
    limit: QUOTA_PER_MONTH,
    remaining: Math.max(0, QUOTA_PER_MONTH - slot.used)
  };
}
