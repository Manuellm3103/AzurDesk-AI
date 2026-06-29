import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';
import aaasRouter from './aaasRouterService.js';

const NODE_TYPES = ['prompt', 'condition', 'branch', 'output', 'delay', 'http', 'aggregate'];

export function createWorkflow(tenant_id, { name, description = '', nodes = [], edges = [] }) {
  if (!tenant_id || !name) throw new Error('tenant_id y name requeridos');
  validateGraph(nodes, edges);
  const id = randomUUID();
  db.prepare(`INSERT INTO ai_workflows (id, tenant_id, name, description, nodes, edges, status, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)`)
    .run(id, tenant_id, name, description, JSON.stringify(nodes), JSON.stringify(edges), now(), now());
  return getWorkflow(id, tenant_id);
}

export function getWorkflow(id, tenant_id) {
  const row = db.prepare('SELECT * FROM ai_workflows WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  return row ? rowToWorkflow(row) : null;
}

export function listWorkflows(tenant_id) {
  return db.prepare('SELECT * FROM ai_workflows WHERE tenant_id = ? ORDER BY updated_at DESC').all(tenant_id).map(rowToWorkflow);
}

export function updateWorkflow(id, tenant_id, fields) {
  const sets = []; const vals = [];
  for (const k of ['name', 'description', 'status']) {
    if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); }
  }
  if (fields.nodes !== undefined) { validateGraph(fields.nodes, fields.edges); sets.push('nodes=?'); vals.push(JSON.stringify(fields.nodes)); }
  if (fields.edges !== undefined) { sets.push('edges=?'); vals.push(JSON.stringify(fields.edges)); }
  if (!sets.length) return getWorkflow(id, tenant_id);
  sets.push('version = version + 1', 'updated_at=?'); vals.push(now()); vals.push(id, tenant_id);
  db.prepare(`UPDATE ai_workflows SET ${sets.join(', ')} WHERE id=? AND tenant_id=?`).run(...vals);
  return getWorkflow(id, tenant_id);
}

export function deleteWorkflow(id, tenant_id) {
  return db.prepare('DELETE FROM ai_workflows WHERE id = ? AND tenant_id = ?').run(id, tenant_id).changes > 0;
}

export async function runWorkflow(tenant_id, workflowId, inputs = {}) {
  const wf = getWorkflow(workflowId, tenant_id);
  if (!wf) return { success: false, error: 'Workflow no encontrado' };

  const runId = randomId('wfrun');
  db.prepare('INSERT INTO ai_workflow_runs (id, tenant_id, workflow_id, inputs, status, node_results, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(runId, tenant_id, workflowId, JSON.stringify(inputs), 'running', '[]', now(), now());

  const nodes = wf.nodes || [];
  const edges = wf.edges || [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source).push(e);
  }

  // Find entry nodes (no incoming edges)
  const incoming = new Set(edges.map((e) => e.target));
  const entryNodes = nodes.filter((n) => !incoming.has(n.id));

  const context = { inputs, results: {}, outputs: {} };
  const visited = new Set();
  const queue = [...entryNodes];

  while (queue.length) {
    const node = queue.shift();
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    try {
      const result = await executeNode(node, context, tenant_id);
      context.results[node.id] = result;

      if (node.type === 'output') {
        context.outputs[node.id] = result;
      }

      // Determine next nodes
    const next = adjacency.get(node.id) || [];
      for (const edge of next) {
        if (edge.condition) {
          const condResult = evaluateCondition(edge.condition, result);
          if (!condResult) continue;
        }
        const targetNode = nodeMap.get(edge.target);
        if (targetNode) queue.push(targetNode);
      }
    } catch (e) {
      context.results[node.id] = { error: e.message };
    }
  }

  db.prepare('UPDATE ai_workflow_runs SET status = ?, outputs = ?, node_results = ?, completed_at = ? WHERE id = ?')
    .run('completed', JSON.stringify(context.outputs), JSON.stringify(context.results), now(), runId);

  return { success: true, run_id: runId, outputs: context.outputs, results: context.results };
}

async function executeNode(node, context, tenant_id) {
  if (node.type === 'prompt') {
    const tmpl = node.config?.template || '';
    const vars = { ...context.inputs, ...context.results };
    let prompt = tmpl;
    for (const [k, v] of Object.entries(vars)) {
      prompt = prompt.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), typeof v === 'string' ? v : JSON.stringify(v));
    }
    const result = await aaasRouter.generate(tenant_id, {
      prompt,
      system: node.config?.system || '',
      max_tokens: node.config?.max_tokens || 2048,
      temperature: node.config?.temperature || 0.7
    });
    return result;
  }
  if (node.type === 'condition') {
    const value = context.results[node.config?.input_node]?.text || context.inputs[node.config?.input_field];
    return { condition_met: !!value, value };
  }
  if (node.type === 'output') {
    const value = context.results[node.config?.input_node]?.text || context.inputs[node.config?.input_field] || '';
    return { text: value };
  }
  if (node.type === 'delay') {
    return { delayed: true, ms: node.config?.ms || 0 };
  }
  if (node.type === 'http') {
    return { url: node.config?.url, method: node.config?.method || 'GET' };
  }
  if (node.type === 'aggregate') {
    const inputs = (node.config?.input_nodes || []).map((nid) => context.results[nid]?.text || '').filter(Boolean);
    return { text: inputs.join('\n\n') };
  }
  return { type: node.type };
}

function evaluateCondition(condition, result) {
  if (condition === 'truthy') return !!result;
  if (condition === 'falsy') return !result;
  if (condition === 'success') return result?.success === true;
  if (condition === 'failure') return result?.success === false;
  return true;
}

function validateGraph(nodes, edges) {
  for (const node of nodes) {
    if (!NODE_TYPES.includes(node.type)) throw new Error(`Tipo de nodo inválido: ${node.type}. Válidos: ${NODE_TYPES.join(', ')}`);
    if (!node.id) throw new Error('Cada nodo debe tener un id');
  }
  for (const edge of edges) {
    if (!edge.source || !edge.target) throw new Error('Cada edge debe tener source y target');
  }
}

function rowToWorkflow(row) {
  return {
    id: row.id, tenant_id: row.tenant_id, name: row.name, description: row.description,
    nodes: safeJson(row.nodes, []), edges: safeJson(row.edges, []),
    status: row.status, version: row.version, created_at: row.created_at, updated_at: row.updated_at
  };
}

export { NODE_TYPES };
export default { createWorkflow, getWorkflow, listWorkflows, updateWorkflow, deleteWorkflow, runWorkflow, NODE_TYPES };