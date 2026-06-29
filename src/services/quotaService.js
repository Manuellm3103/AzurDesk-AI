import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

function getOrCreateQuota(tenant_id) {
  let row = db.prepare('SELECT * FROM tenant_quotas WHERE tenant_id = ?').get(tenant_id);
  if (!row) {
    const id = randomId('quota');
    db.prepare(`INSERT INTO tenant_quotas (id, tenant_id, max_llm_calls_per_day, max_llm_cost_per_day, max_api_keys, max_agents, max_storage_mb, current_llm_calls_today, current_cost_today, reset_at, created_at, updated_at)
      VALUES (?, ?, 1000, 10.0, 10, 50, 1024, 0, 0, ?, ?, ?)`)
      .run(id, tenant_id, now(), now(), now());
    row = db.prepare('SELECT * FROM tenant_quotas WHERE tenant_id = ?').get(tenant_id);
  }
  return row;
}

function maybeReset(quota) {
  const today = new Date().toISOString().slice(0, 10);
  const resetDay = (quota.reset_at || '').slice(0, 10);
  if (today !== resetDay) {
    db.prepare('UPDATE tenant_quotas SET current_llm_calls_today = 0, current_cost_today = 0, reset_at = ?, updated_at = ? WHERE id = ?')
      .run(now(), now(), quota.id);
    quota.current_llm_calls_today = 0;
    quota.current_cost_today = 0;
    quota.reset_at = now();
  }
  return quota;
}

export function getQuota(tenant_id) {
  return getOrCreateQuota(tenant_id);
}

export function updateQuota(tenant_id, fields) {
  const q = getOrCreateQuota(tenant_id);
  const sets = [];
  const vals = [];
  for (const k of ['max_llm_calls_per_day', 'max_llm_cost_per_day', 'max_api_keys', 'max_agents', 'max_storage_mb']) {
    if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); }
  }
  if (!sets.length) return getQuota(tenant_id);
  sets.push('updated_at=?'); vals.push(now());
  vals.push(q.id);
  db.prepare(`UPDATE tenant_quotas SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getQuota(tenant_id);
}

export function checkLlmAllowed(tenant_id) {
  const q = maybeReset(getOrCreateQuota(tenant_id));
  return q.current_llm_calls_today < q.max_llm_calls_per_day && q.current_cost_today < q.max_llm_cost_per_day;
}

export function recordLlmUsage(tenant_id, costUsd = 0) {
  const q = maybeReset(getOrCreateQuota(tenant_id));
  db.prepare('UPDATE tenant_quotas SET current_llm_calls_today = current_llm_calls_today + 1, current_cost_today = current_cost_today + ?, updated_at = ? WHERE id = ?')
    .run(costUsd, now(), q.id);
}

export function getUsageSummary(tenant_id) {
  const q = maybeReset(getOrCreateQuota(tenant_id));
  return {
    llm_calls_today: q.current_llm_calls_today,
    llm_cost_today: q.current_cost_today,
    limits: {
      max_llm_calls_per_day: q.max_llm_calls_per_day,
      max_llm_cost_per_day: q.max_llm_cost_per_day,
      max_api_keys: q.max_api_keys,
      max_agents: q.max_agents,
      max_storage_mb: q.max_storage_mb
    },
    remaining_calls: Math.max(0, q.max_llm_calls_per_day - q.current_llm_calls_today),
    remaining_cost: Math.max(0, q.max_llm_cost_per_day - q.current_cost_today),
    reset_at: q.reset_at
  };
}

export default { getQuota, updateQuota, checkLlmAllowed, recordLlmUsage, getUsageSummary };