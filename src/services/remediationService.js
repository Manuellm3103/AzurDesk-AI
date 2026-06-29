import { randomUUID } from 'crypto';
import db from './db.js';
import { now } from './_utils.js';

// Auto-remediation DSL: declarative rules that match alerts/conditions and run action sequences.
// Supported action types: notify, webhook, run_agent, set_policy, sweep_sessions.

const BUILTIN_ACTIONS = {
  notify: async (ctx, args) => ({ ok: true, message: `notified ${args.channel || 'default'}` }),
  webhook: async (ctx, args) => ({ ok: true, message: `webhook to ${args.url}` }),
  run_agent: async (ctx, args) => ({ ok: true, message: `agent ${args.agent_id} ran` }),
  set_policy: async (ctx, args) => ({ ok: true, message: `policy ${args.policy_id} set to ${args.enabled}` }),
  sweep_sessions: async (ctx, args) => ({ ok: true, message: `swept stalled sessions` }),
  noop: async (ctx, args) => ({ ok: true, message: 'noop' })
};

function createRule(tenant_id, { name, trigger, condition, actions, enabled = true }) {
  if (!tenant_id || !name || !trigger || !actions?.length) throw new Error('tenant_id, name, trigger and actions required');
  const id = randomUUID();
  const created = now();
  db.prepare(`INSERT INTO remediation_rules (id, tenant_id, name, trigger, condition, actions, enabled, run_count, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, name, trigger, JSON.stringify(condition || {}), JSON.stringify(actions), enabled ? 1 : 0, 0, created, created);
  return getRule(id);
}

function getRule(id) {
  const row = db.prepare('SELECT * FROM remediation_rules WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, condition: JSON.parse(row.condition || '{}'), actions: JSON.parse(row.actions || '[]'), enabled: !!row.enabled };
}

function listRules(tenant_id, { enabled } = {}) {
  let sql = 'SELECT * FROM remediation_rules WHERE tenant_id = ?';
  const params = [tenant_id];
  if (enabled != null) { sql += ' AND enabled = ?'; params.push(enabled ? 1 : 0); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(r => ({ ...r, condition: JSON.parse(r.condition || '{}'), actions: JSON.parse(r.actions || '[]'), enabled: !!r.enabled }));
}

function updateRule(id, tenant_id, updates) {
  const row = getRule(id);
  if (!row || row.tenant_id !== tenant_id) return null;
  const set = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['name','trigger','enabled'].includes(k)) {
      set.push(`${k} = ?`);
      params.push(k === 'enabled' ? (v ? 1 : 0) : v);
    }
    if (k === 'condition') { set.push('condition = ?'); params.push(JSON.stringify(v)); }
    if (k === 'actions') { set.push('actions = ?'); params.push(JSON.stringify(v)); }
  }
  if (!set.length) return row;
  params.push(now(), id, tenant_id);
  db.prepare(`UPDATE remediation_rules SET ${set.join(', ')}, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(...params);
  return getRule(id);
}

function deleteRule(id, tenant_id) {
  return db.prepare('DELETE FROM remediation_rules WHERE id = ? AND tenant_id = ?').run(id, tenant_id).changes > 0;
}

function matchCondition(condition, ctx) {
  for (const [k, expected] of Object.entries(condition || {})) {
    const actual = ctx[k];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (typeof expected === 'object') {
      // { gt: 2.5 } style
      for (const [op, val] of Object.entries(expected)) {
        if (op === 'gt' && !(actual > val)) return false;
        if (op === 'gte' && !(actual >= val)) return false;
        if (op === 'lt' && !(actual < val)) return false;
        if (op === 'lte' && !(actual <= val)) return false;
        if (op === 'eq' && actual !== val) return false;
        if (op === 'neq' && actual === val) return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

async function evaluateTrigger(tenant_id, triggerName, ctx) {
  const rules = listRules(tenant_id, { enabled: true }).filter(r => r.trigger === triggerName);
  const results = [];
  for (const rule of rules) {
    if (matchCondition(rule.condition, ctx)) {
      const run = await runRule(tenant_id, rule.id, ctx.alert_id, ctx);
      results.push({ rule_id: rule.id, status: run.status });
    }
  }
  return results;
}

async function runRule(tenant_id, rule_id, alert_id, ctx = {}) {
  const rule = getRule(rule_id);
  if (!rule || rule.tenant_id !== tenant_id || !rule.enabled) return { status: 'skipped', output: null };
  const runId = randomUUID();
  const created = now();
  db.prepare(`INSERT INTO remediation_runs (id, tenant_id, rule_id, alert_id, status, output, error, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(runId, tenant_id, rule_id, alert_id || null, 'running', null, null, created, created);
  const outputs = [];
  let error = null;
  try {
    for (const action of rule.actions) {
      const fn = BUILTIN_ACTIONS[action.type];
      if (!fn) throw new Error(`unknown action type ${action.type}`);
      const out = await fn(ctx, action.args || {});
      outputs.push(out);
    }
  } catch (e) {
    error = String(e.message || e);
  }
  const status = error ? 'failed' : 'completed';
  db.prepare(`UPDATE remediation_runs SET status = ?, output = ?, error = ?, updated_at = ? WHERE id = ?`)
    .run(status, JSON.stringify(outputs), error, now(), runId);
  db.prepare(`UPDATE remediation_rules SET run_count = run_count + 1, last_run_at = ? WHERE id = ?`).run(now(), rule_id);
  return { status, outputs, error, run_id: runId };
}

function listRuns(tenant_id, { rule_id, status, limit = 50 } = {}) {
  let sql = 'SELECT * FROM remediation_runs WHERE tenant_id = ?';
  const params = [tenant_id];
  if (rule_id) { sql += ' AND rule_id = ?'; params.push(rule_id); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params).map(r => ({ ...r, output: JSON.parse(r.output || 'null') }));
}

export default { createRule, getRule, listRules, updateRule, deleteRule, evaluateTrigger, runRule, listRuns, matchCondition, BUILTIN_ACTIONS };
export { createRule, getRule, listRules, updateRule, deleteRule, evaluateTrigger, runRule, listRuns, matchCondition, BUILTIN_ACTIONS };
