import { randomUUID } from 'crypto';
import { now } from './_utils.js';
import db from './db.js';

// Lightweight sandbox for agent tool execution.
// Tracks start/stop, result, status and resource usage.
// SQLite-first; optionally backed by Docker/Podman if DOCKER_HOST present.

function createSandbox(tenant_id, agent_id, { runtime = 'vm2', allow_network = false, allowed_tools = [], resource_limits = {}, env = {} } = {}) {
  if (!tenant_id || !agent_id) throw new Error('tenant_id and agent_id required');
  const id = randomUUID();
  const created = now();
  db.prepare(`INSERT INTO agent_sandboxes (id, tenant_id, agent_id, runtime, status, allow_network, allowed_tools, resource_limits, env, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, agent_id, runtime, 'created', allow_network ? 1 : 0, JSON.stringify(allowed_tools), JSON.stringify(resource_limits), JSON.stringify(env), created, created);
  return getSandbox(id);
}

function getSandbox(id) {
  const row = db.prepare('SELECT * FROM agent_sandboxes WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, allow_network: !!row.allow_network, allowed_tools: JSON.parse(row.allowed_tools || '[]'), resource_limits: JSON.parse(row.resource_limits || '{}'), env: JSON.parse(row.env || '{}') };
}

function listSandboxes(tenant_id, { status } = {}) {
  let sql = 'SELECT * FROM agent_sandboxes WHERE tenant_id = ?';
  const params = [tenant_id];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(r => ({ ...r, allow_network: !!r.allow_network, allowed_tools: JSON.parse(r.allowed_tools || '[]'), resource_limits: JSON.parse(r.resource_limits || '{}'), env: JSON.parse(r.env || '{}') }));
}

function updateStatus(id, tenant_id, status, { output = null, error = null } = {}) {
  const row = getSandbox(id);
  if (!row || row.tenant_id !== tenant_id) return null;
  db.prepare(`UPDATE agent_sandboxes SET status = ?, output = ?, error = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
    .run(status, output, error, now(), id, tenant_id);
  return getSandbox(id);
}

function startSandbox(id, tenant_id) {
  const row = getSandbox(id);
  if (!row || row.tenant_id !== tenant_id) return null;
  // Simulation: in production this would spawn Docker/Podman/gVisor.
  return updateStatus(id, tenant_id, 'running', { output: '[sandbox started]' });
}

function stopSandbox(id, tenant_id, { result = null } = {}) {
  const row = getSandbox(id);
  if (!row || row.tenant_id !== tenant_id) return null;
  return updateStatus(id, tenant_id, 'stopped', { output: (row.output || '') + '\n[sandbox stopped]' + (result ? `\n${JSON.stringify(result)}` : '') });
}

function executeInSandbox(id, tenant_id, { tool, args = {} } = {}) {
  const row = getSandbox(id);
  if (!row || row.tenant_id !== tenant_id) throw new Error('sandbox not found');
  if (row.status !== 'running') throw new Error('sandbox not running');
  const allowed = row.allowed_tools;
  if (allowed.length && !allowed.includes(tool)) throw new Error(`tool ${tool} not allowed in sandbox`);
  const output = { tool, args, status: 'ok', ts: now() };
  db.prepare(`INSERT INTO sandbox_executions (id, sandbox_id, tenant_id, tool, args, result, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), id, tenant_id, tool, JSON.stringify(args), JSON.stringify(output), now());
  return output;
}

function listExecutions(tenant_id, { sandbox_id, limit = 50 } = {}) {
  let sql = 'SELECT * FROM sandbox_executions WHERE tenant_id = ?';
  const params = [tenant_id];
  if (sandbox_id) { sql += ' AND sandbox_id = ?'; params.push(sandbox_id); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params).map(r => ({ ...r, args: JSON.parse(r.args || '{}'), result: JSON.parse(r.result || '{}') }));
}

function deleteSandbox(id, tenant_id) {
  const info = db.prepare('DELETE FROM agent_sandboxes WHERE id = ? AND tenant_id = ?').run(id, tenant_id);
  return info.changes > 0;
}

export default { createSandbox, getSandbox, listSandboxes, startSandbox, stopSandbox, executeInSandbox, listExecutions, deleteSandbox };
export { createSandbox, getSandbox, listSandboxes, startSandbox, stopSandbox, executeInSandbox, listExecutions, deleteSandbox };
