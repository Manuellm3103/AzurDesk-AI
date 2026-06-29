import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';

// Declarative policy engine for agent actions (A2A, MCP, tool calls).
// Conditions are a JSON object of operator -> [field, value] pairs:
// { "eq": { "agent.level": 3 }, "lte": { "cost_estimate": 1.0 } }
// Operators: eq, neq, gt, gte, lt, lte, in, contains.

const OPS = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  contains: (a, b) => Array.isArray(a) && a.includes(b)
};

function getValue(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function evaluateConditions(conditions, ctx) {
  for (const [op, rules] of Object.entries(conditions || {})) {
    const fn = OPS[op];
    if (!fn) continue;
    for (const [field, expected] of Object.entries(rules)) {
      const actual = getValue(ctx, field);
      if (!fn(actual, expected)) return { pass: false, reason: `${field} ${op} ${JSON.stringify(expected)} failed (actual ${JSON.stringify(actual)})` };
    }
  }
  return { pass: true };
}

function createPolicy(tenant_id, { name, resource, action, conditions, effect = 'allow', priority = 0, enabled = 1 }) {
  if (!tenant_id || !resource || !action) throw new Error('tenant_id, resource and action required');
  const id = randomUUID();
  const created = now();
  db.prepare(`INSERT INTO agent_policies (id, tenant_id, name, resource, action, conditions, effect, priority, enabled, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, name || `${resource}:${action}`, resource, action, JSON.stringify(conditions || {}), effect, priority, enabled ? 1 : 0, created, created);
  return getPolicy(id);
}

function getPolicy(id) {
  const row = db.prepare('SELECT * FROM agent_policies WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, conditions: JSON.parse(row.conditions) };
}

function listPolicies(tenant_id, { resource, action, enabled } = {}) {
  let sql = 'SELECT * FROM agent_policies WHERE tenant_id = ?';
  const params = [tenant_id];
  if (resource) { sql += ' AND resource = ?'; params.push(resource); }
  if (action) { sql += ' AND action = ?'; params.push(action); }
  if (enabled != null) { sql += ' AND enabled = ?'; params.push(enabled ? 1 : 0); }
  sql += ' ORDER BY priority DESC, created_at ASC';
  return db.prepare(sql).all(...params).map(r => ({ ...r, conditions: JSON.parse(r.conditions) }));
}

function updatePolicy(id, tenant_id, updates) {
  const row = getPolicy(id);
  if (!row || row.tenant_id !== tenant_id) return null;
  const set = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['name','resource','action','effect','priority','enabled'].includes(k)) {
      set.push(`${k} = ?`);
      params.push(k === 'enabled' ? (v ? 1 : 0) : v);
    }
    if (k === 'conditions') { set.push('conditions = ?'); params.push(JSON.stringify(v)); }
  }
  if (!set.length) return row;
  params.push(now(), id, tenant_id);
  db.prepare(`UPDATE agent_policies SET ${set.join(', ')}, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(...params);
  return getPolicy(id);
}

function deletePolicy(id, tenant_id) {
  const info = db.prepare('DELETE FROM agent_policies WHERE id = ? AND tenant_id = ?').run(id, tenant_id);
  return info.changes > 0;
}

function decide(tenant_id, resource, action, ctx = {}) {
  const policies = listPolicies(tenant_id, { resource, action, enabled: 1 });
  if (!policies.length) return { decision: 'allow', reason: 'no policies defined', policy_id: null };
  let decision = 'allow';
  let matchedPolicy = null;
  for (const policy of policies) {
    const evalRes = evaluateConditions(policy.conditions, ctx);
    if (evalRes.pass) {
      matchedPolicy = policy;
      decision = policy.effect;
      break;
    }
  }
  const reason = matchedPolicy
    ? `${matchedPolicy.effect} by policy "${matchedPolicy.name}" (${matchedPolicy.id})`
    : 'no matching policy; default allow';
  const decisionId = randomUUID();
  db.prepare(`INSERT INTO policy_decisions (id, tenant_id, policy_id, resource, action, context, decision, reason, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(decisionId, tenant_id, matchedPolicy?.id || null, resource, action, JSON.stringify(ctx), decision, reason, now());
  return { decision, reason, policy_id: matchedPolicy?.id || null, decision_id: decisionId };
}

function listDecisions(tenant_id, { limit = 50 } = {}) {
  return db.prepare('SELECT * FROM policy_decisions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?').all(tenant_id, limit);
}

export default {
  createPolicy, getPolicy, listPolicies, updatePolicy, deletePolicy, decide, listDecisions, evaluateConditions
};
export { createPolicy, getPolicy, listPolicies, updatePolicy, deletePolicy, decide, listDecisions, evaluateConditions };
