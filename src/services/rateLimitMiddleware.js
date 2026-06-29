import db from './db.js';
import { now } from './_utils.js';

const WINDOW_MS = 60 * 1000; // 1 minuto
const DEFAULT_LIMIT = 300; // 300 req/min por defecto
const requestCounts = new Map(); // tenant_id -> { count, reset_at, limit }
const EXEMPT_PATHS = new Set(['/api/health', '/api/plans', '/api/auth/login', '/api/auth/signup', '/api/docs']);

export function rateLimit(req, res, user) {
  if (!user || !user.tenant_id) return true;
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (EXEMPT_PATHS.has(pathname)) return true;

  const tenant_id = user.tenant_id;
  const entry = requestCounts.get(tenant_id);
  const nowMs = Date.now();

  if (!entry || nowMs > entry.reset_at) {
    requestCounts.set(tenant_id, { count: 1, reset_at: nowMs + WINDOW_MS, limit: DEFAULT_LIMIT });
    res.setHeader('X-RateLimit-Limit', DEFAULT_LIMIT);
    res.setHeader('X-RateLimit-Remaining', DEFAULT_LIMIT - 1);
    return true;
  }

  entry.count++;
  const remaining = Math.max(0, entry.limit - entry.count);
  res.setHeader('X-RateLimit-Limit', entry.limit);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (entry.count > entry.limit) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil((entry.reset_at - nowMs) / 1000) });
    res.end(JSON.stringify({ success: false, error: 'Rate limit exceeded', retry_after: Math.ceil((entry.reset_at - nowMs) / 1000) }));
    return false;
  }

  return true;
}

export function getRateLimitStats(tenant_id) {
  const entry = requestCounts.get(tenant_id);
  if (!entry) return { count: 0, limit: 60, reset_at: null };
  return { count: entry.count, limit: entry.limit, reset_at: new Date(entry.reset_at).toISOString() };
}

export default { rateLimit, getRateLimitStats };