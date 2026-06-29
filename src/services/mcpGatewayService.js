import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';
import mcpRegistryService from './mcpRegistryService.js';
import agentCostService from './agentCostService.js';

// MCP Gateway: multi-tenant tool registry with rate-limiting and per-call billing.
class MCPGatewayService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_gateway_tools (
        id TEXT PRIMARY KEY, tenant_id TEXT, server_id TEXT, tool_name TEXT,
        enabled INTEGER DEFAULT 1, rate_limit_rpm INTEGER DEFAULT 60,
        cost_per_call REAL DEFAULT 0, metadata TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_gateway_tools ON mcp_gateway_tools (tenant_id, server_id, tool_name, enabled);
      CREATE TABLE IF NOT EXISTS mcp_gateway_calls (
        id TEXT PRIMARY KEY, tenant_id TEXT, tool_id TEXT, server_id TEXT, tool_name TEXT,
        input TEXT, output TEXT, cost REAL, status TEXT, error TEXT, created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_gateway_calls ON mcp_gateway_calls (tenant_id, tool_id, created_at);
    `);
  }

  registerTool(tenant_id, { server_id, tool_name, rate_limit_rpm = 60, cost_per_call = 0, metadata = {} }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO mcp_gateway_tools (id, tenant_id, server_id, tool_name, enabled, rate_limit_rpm, cost_per_call, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, server_id, tool_name, 1, rate_limit_rpm, cost_per_call, JSON.stringify(metadata), now(), now());
    return this.getTool(tenant_id, id);
  }

  getTool(tenant_id, id) {
    this.ensureTables();
    const r = db.prepare('SELECT * FROM mcp_gateway_tools WHERE id=? AND tenant_id=?').get(id, tenant_id);
    if (!r) return null;
    return this._hydrateTool(r);
  }

  listTools(tenant_id, { server_id, enabled } = {}) {
    this.ensureTables();
    let sql = 'SELECT * FROM mcp_gateway_tools WHERE tenant_id=?';
    const args = [tenant_id];
    if (server_id) { sql += ' AND server_id=?'; args.push(server_id); }
    if (enabled !== undefined) { sql += ' AND enabled=?'; args.push(enabled ? 1 : 0); }
    sql += ' ORDER BY created_at DESC';
    return db.prepare(sql).all(...args).map(r => this._hydrateTool(r));
  }

  updateTool(tenant_id, id, { enabled, rate_limit_rpm, cost_per_call, metadata }) {
    this.ensureTables();
    const tool = this.getTool(tenant_id, id);
    if (!tool) return null;
    const sets = [];
    const args = [];
    if (enabled !== undefined) { sets.push('enabled=?'); args.push(enabled ? 1 : 0); }
    if (rate_limit_rpm !== undefined) { sets.push('rate_limit_rpm=?'); args.push(rate_limit_rpm); }
    if (cost_per_call !== undefined) { sets.push('cost_per_call=?'); args.push(cost_per_call); }
    if (metadata !== undefined) { sets.push('metadata=?'); args.push(JSON.stringify(metadata)); }
    if (sets.length === 0) return tool;
    sets.push('updated_at=?'); args.push(now());
    args.push(id, tenant_id);
    db.prepare(`UPDATE mcp_gateway_tools SET ${sets.join(', ')} WHERE id=? AND tenant_id=?`).run(...args);
    return this.getTool(tenant_id, id);
  }

  deleteTool(tenant_id, id) {
    this.ensureTables();
    const r = db.prepare('DELETE FROM mcp_gateway_tools WHERE id=? AND tenant_id=?').run(id, tenant_id);
    return r.changes > 0;
  }

  // Check rate limit by counting calls in the last minute.
  isAllowed(tenant_id, tool_id) {
    this.ensureTables();
    const tool = this.getTool(tenant_id, tool_id);
    if (!tool || !tool.enabled) return { allowed: false, reason: 'tool disabled or missing' };
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const calls = db.prepare('SELECT COUNT(*) as c FROM mcp_gateway_calls WHERE tenant_id=? AND tool_id=? AND created_at > ?').get(tenant_id, tool_id, since).c;
    if (calls >= tool.rate_limit_rpm) return { allowed: false, reason: 'rate limit exceeded', limit: tool.rate_limit_rpm };
    return { allowed: true, tool };
  }

  // Execute an MCP tool call: rate-limit, record call, bill, return stub output.
  async call(tenant_id, tool_id, input) {
    this.ensureTables();
    const check = this.isAllowed(tenant_id, tool_id);
    if (!check.allowed) {
      db.prepare('INSERT INTO mcp_gateway_calls (id, tenant_id, tool_id, server_id, tool_name, input, output, cost, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), tenant_id, tool_id, null, null, JSON.stringify(input || {}), null, 0, 'rate_limited', check.reason, now());
      return { success: false, error: check.reason };
    }
    const tool = check.tool;
    const server = mcpRegistryService.get(tool.server_id) || { name: tool.server_id };
    const output = { result: `executed ${tool.tool_name} via ${server.name || tool.server_id}`, input };
    const cost = tool.cost_per_call || 0;
    db.prepare('INSERT INTO mcp_gateway_calls (id, tenant_id, tool_id, server_id, tool_name, input, output, cost, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), tenant_id, tool_id, tool.server_id, tool.tool_name, JSON.stringify(input || {}), JSON.stringify(output), cost, 'success', null, now());
    if (cost > 0) {
      agentCostService.recordCharge(tenant_id, { resource: 'mcp.tool', resource_id: tool_id, agent_id: null, session_id: null, metric: 'mcp.call', quantity: 1, rate: cost, metadata: { tool_name: tool.tool_name, server_id: tool.server_id } });
    }
    return { success: true, output, cost };
  }

  calls(tenant_id, { tool_id, limit = 50, offset = 0 } = {}) {
    this.ensureTables();
    let sql = 'SELECT * FROM mcp_gateway_calls WHERE tenant_id=?';
    const args = [tenant_id];
    if (tool_id) { sql += ' AND tool_id=?'; args.push(tool_id); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    args.push(limit, offset);
    return db.prepare(sql).all(...args).map(r => ({ ...r, input: this._json(r.input), output: this._json(r.output), error: this._json(r.error) }));
  }

  totals(tenant_id, { since } = {}) {
    this.ensureTables();
    let sql = 'SELECT server_id, tool_name, COUNT(*) as calls, SUM(cost) as total_cost FROM mcp_gateway_calls WHERE tenant_id=?';
    const args = [tenant_id];
    if (since) { sql += ' AND created_at > ?'; args.push(since); }
    sql += ' GROUP BY server_id, tool_name ORDER BY total_cost DESC';
    return db.prepare(sql).all(...args);
  }

  _hydrateTool(r) {
    return { id: r.id, tenant_id: r.tenant_id, server_id: r.server_id, tool_name: r.tool_name, enabled: !!r.enabled, rate_limit_rpm: r.rate_limit_rpm, cost_per_call: r.cost_per_call, metadata: this._json(r.metadata), created_at: r.created_at, updated_at: r.updated_at };
  }

  _json(v) {
    if (!v) return null;
    try { return JSON.parse(v); } catch { return v; }
  }
}

export default new MCPGatewayService();
