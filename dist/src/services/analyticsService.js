import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

export function recordMetric({ tenant_id, provider, model, prompt_tokens = 0, completion_tokens = 0, cost_usd = 0, latency_ms = 0, prompt_id = null }) {
  const total = prompt_tokens + completion_tokens;
  const id = randomId('metric');
  db.prepare('INSERT INTO llm_metrics (id, tenant_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, prompt_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, tenant_id, provider, model, prompt_tokens, completion_tokens, total, cost_usd, latency_ms, prompt_id, now());
  return id;
}

export function getTenantSummary(tenant_id, period = '7d') {
  const days = parseInt(period, 10) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const totals = db.prepare(`
    SELECT COUNT(*) as requests, SUM(total_tokens) as tokens, SUM(cost_usd) as cost, AVG(latency_ms) as avg_latency, MAX(latency_ms) as max_latency
    FROM llm_metrics WHERE tenant_id = ? AND timestamp > ?
  `).get(tenant_id, since);

  const byProvider = db.prepare(`
    SELECT provider, COUNT(*) as requests, SUM(cost_usd) as cost, AVG(latency_ms) as avg_latency
    FROM llm_metrics WHERE tenant_id = ? AND timestamp > ? GROUP BY provider ORDER BY cost DESC
  `).all(tenant_id, since);

  const byModel = db.prepare(`
    SELECT model, COUNT(*) as requests, SUM(total_tokens) as tokens, SUM(cost_usd) as cost
    FROM llm_metrics WHERE tenant_id = ? AND timestamp > ? GROUP BY model ORDER BY requests DESC
  `).all(tenant_id, since);

  const daily = db.prepare(`
    SELECT substr(timestamp, 1, 10) as day, SUM(cost_usd) as cost, SUM(total_tokens) as tokens, COUNT(*) as requests
    FROM llm_metrics WHERE tenant_id = ? AND timestamp > ? GROUP BY day ORDER BY day ASC
  `).all(tenant_id, since);

  return {
    period: `${days}d`,
    since,
    totals: { ...totals, cost: totals.cost || 0, tokens: totals.tokens || 0, requests: totals.requests || 0, avg_latency: totals.avg_latency || 0, max_latency: totals.max_latency || 0 },
    by_provider: byProvider,
    by_model: byModel,
    daily: daily
  };
}

export function getGlobalTopModels(limit = 10) {
  return db.prepare(`
    SELECT model, provider, COUNT(*) as requests, SUM(cost_usd) as cost, AVG(latency_ms) as avg_latency
    FROM llm_metrics GROUP BY model, provider ORDER BY requests DESC LIMIT ?
  `).all(limit);
}

export function getUsageRankings(limit = 20) {
  return db.prepare(`
    SELECT tenant_id, COUNT(*) as requests, SUM(cost_usd) as cost, SUM(total_tokens) as tokens
    FROM llm_metrics GROUP BY tenant_id ORDER BY cost DESC LIMIT ?
  `).all(limit);
}

export default { recordMetric, getTenantSummary, getGlobalTopModels, getUsageRankings };