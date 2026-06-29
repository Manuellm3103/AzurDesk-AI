import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

// Multi-tenant cost attribution for agents, sessions and LLM usage.

const COST_RATES = {
  'llm.token.input': 0.0000015,   // per token
  'llm.token.output': 0.000006,
  'agent.invocation': 0.01,
  'sandbox.execution': 0.02,
  'workflow.run': 0.005,
  'storage.mb': 0.001,
  'compute.second': 0.0001
};

function recordCharge(tenant_id, { resource, resource_id, agent_id, session_id, metric, quantity, metadata = {} }) {
  if (!tenant_id || !resource || !metric || quantity == null) throw new Error('tenant_id, resource, metric, quantity required');
  const rate = COST_RATES[metric] || 0;
  const cost = Math.round(quantity * rate * 1e6) / 1e6;
  const id = randomUUID();
  const created = now();
  db.prepare(`INSERT INTO agent_cost_charges (id, tenant_id, resource, resource_id, agent_id, session_id, metric, quantity, rate, cost, metadata, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, resource, resource_id || null, agent_id || null, session_id || null, metric, quantity, rate, cost, JSON.stringify(metadata), created);
  return { id, tenant_id, resource, resource_id, agent_id, session_id, metric, quantity, rate, cost, created_at: created };
}

function getCharges(tenant_id, { agent_id, session_id, resource, limit = 100 } = {}) {
  let sql = 'SELECT * FROM agent_cost_charges WHERE tenant_id = ?';
  const params = [tenant_id];
  if (agent_id) { sql += ' AND agent_id = ?'; params.push(agent_id); }
  if (session_id) { sql += ' AND session_id = ?'; params.push(session_id); }
  if (resource) { sql += ' AND resource = ?'; params.push(resource); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

function summarizeByResource(tenant_id, { period, limit = 50 } = {}) {
  let sql = 'SELECT resource, metric, SUM(quantity) as total_quantity, SUM(cost) as total_cost, COUNT(*) as count FROM agent_cost_charges WHERE tenant_id = ?';
  const params = [tenant_id];
  if (period) { sql += " AND created_at LIKE ?"; params.push(period + '%'); }
  sql += ' GROUP BY resource, metric ORDER BY total_cost DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

function summarizeByAgent(tenant_id, { limit = 50 } = {}) {
  return db.prepare(`SELECT agent_id, SUM(cost) as total_cost, COUNT(*) as count
                       FROM agent_cost_charges WHERE tenant_id = ? AND agent_id IS NOT NULL
                       GROUP BY agent_id ORDER BY total_cost DESC LIMIT ?`).all(tenant_id, limit);
}

function getTotals(tenant_id, { period } = {}) {
  let sql = 'SELECT SUM(cost) as total_cost, SUM(quantity) as total_quantity, COUNT(*) as count FROM agent_cost_charges WHERE tenant_id = ?';
  const params = [tenant_id];
  if (period) { sql += " AND created_at LIKE ?"; params.push(period + '%'); }
  const row = db.prepare(sql).get(...params);
  return { tenant_id, total_cost: row.total_cost || 0, total_quantity: row.total_quantity || 0, count: row.count || 0, period: period || 'all' };
}

function estimateLLM(tenant_id, { input_tokens, output_tokens, model }) {
  const inputCost = (input_tokens || 0) * (COST_RATES['llm.token.input']);
  const outputCost = (output_tokens || 0) * (COST_RATES['llm.token.output']);
  const total = Math.round((inputCost + outputCost) * 1e6) / 1e6;
  return { tenant_id, model, input_tokens, output_tokens, estimated_cost_usd: total, rates: { input: COST_RATES['llm.token.input'], output: COST_RATES['llm.token.output'] } };
}

export default { recordCharge, getCharges, summarizeByResource, summarizeByAgent, getTotals, estimateLLM, COST_RATES };
export { recordCharge, getCharges, summarizeByResource, summarizeByAgent, getTotals, estimateLLM, COST_RATES };
