import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';

// Unified Agent Registry and Runtime for AaaS. Every capability is an Agent with lifecycle, state, and capabilities.
class AgentRuntimeService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS aaas_agents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        description TEXT,
        capabilities TEXT, -- JSON array of capability tags
        status TEXT DEFAULT 'idle',
        config TEXT, -- JSON arbitrary config
        state TEXT, -- JSON runtime state
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agents_tenant ON aaas_agents (tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_agents_caps ON aaas_agents (tenant_id);

      CREATE TABLE IF NOT EXISTS aaas_agent_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        agent_id TEXT,
        input TEXT,
        output TEXT,
        status TEXT,
        error TEXT,
        started_at TEXT,
        ended_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runs_agent ON aaas_agent_runs (agent_id, started_at);
    `);
  }

  // Register any system feature as an agent
  register(tenant_id, { name, description, capabilities = [], config = {} }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO aaas_agents (id, tenant_id, name, description, capabilities, status, config, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, name, description, JSON.stringify(capabilities), 'idle', JSON.stringify(config), JSON.stringify({}), now(), now());
    return { id, tenant_id, name, capabilities, status: 'idle' };
  }

  list(tenant_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM aaas_agents WHERE tenant_id=? ORDER BY created_at DESC').all(tenant_id)
      .map(r => ({ ...r, capabilities: JSON.parse(r.capabilities || '[]'), config: JSON.parse(r.config || '{}'), state: JSON.parse(r.state || '{}') }));
  }

  findByCapability(tenant_id, capability) {
    const all = this.list(tenant_id);
    return all.filter(a => a.capabilities.includes(capability));
  }

  get(id) {
    this.ensureTables();
    const r = db.prepare('SELECT * FROM aaas_agents WHERE id=?').get(id);
    if (!r) return null;
    return { ...r, capabilities: JSON.parse(r.capabilities || '[]'), config: JSON.parse(r.config || '{}'), state: JSON.parse(r.state || '{}') };
  }

  updateState(id, statePatch) {
    this.ensureTables();
    const agent = this.get(id);
    if (!agent) return null;
    const newState = { ...agent.state, ...statePatch, last_seen: now() };
    db.prepare('UPDATE aaas_agents SET state=?, updated_at=? WHERE id=?').run(JSON.stringify(newState), now(), id);
    return newState;
  }

  startRun(tenant_id, agent_id, input) {
    this.ensureTables();
    const runId = randomUUID();
    db.prepare('INSERT INTO aaas_agent_runs (id, tenant_id, agent_id, input, status, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(runId, tenant_id, agent_id, JSON.stringify(input), 'running', now());
    db.prepare("UPDATE aaas_agents SET status='busy' WHERE id=?").run(agent_id);
    return { run_id: runId, agent_id, status: 'running' };
  }

  endRun(run_id, { output, status = 'completed', error = null }) {
    this.ensureTables();
    const run = db.prepare('SELECT * FROM aaas_agent_runs WHERE id=?').get(run_id);
    db.prepare('UPDATE aaas_agent_runs SET output=?, status=?, error=?, ended_at=? WHERE id=?')
      .run(JSON.stringify(output), status, error, now(), run_id);
    if (run) db.prepare("UPDATE aaas_agents SET status='idle' WHERE id=?").run(run.agent_id);
    return { run_id, status };
  }

  // Core dispatch: given an intent, route to the best agent by capability match
  dispatch(tenant_id, { intent, payload, context = {} }) {
    this.ensureTables();
    const candidates = this.findByCapability(tenant_id, intent);
    if (!candidates.length) return { success: false, error: `No agent registered for intent: ${intent}` };
    // Simple load balancing: pick idle agent, else first
    const agent = candidates.find(a => a.status === 'idle') || candidates[0];
    const run = this.startRun(tenant_id, agent.id, { intent, payload, context });
    return { success: true, agent: { id: agent.id, name: agent.name }, run };
  }

  getRuns(agent_id, limit = 50) {
    this.ensureTables();
    return db.prepare('SELECT * FROM aaas_agent_runs WHERE agent_id=? ORDER BY started_at DESC LIMIT ?').all(agent_id, limit)
      .map(r => ({ ...r, input: JSON.parse(r.input || '{}'), output: JSON.parse(r.output || 'null') }));
  }
}

export default new AgentRuntimeService();
