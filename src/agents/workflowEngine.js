import { randomUUID } from 'crypto';
import db from '../services/db.js';
import { now, safeJson } from '../services/_utils.js';
import { Agent, createDefaultAgents } from './agentFramework.js';

class WorkflowEngine {
  constructor(database = db) {
    this.db = database;
    this._ensureTable();
    this.agents = new Map(createDefaultAgents().map((a) => [a.id, a]));
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        definition TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS workflow_instances (
        id TEXT PRIMARY KEY,
        workflow_id TEXT,
        tenant_id TEXT,
        status TEXT,
        input TEXT,
        output TEXT,
        current_task TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
  }

  registerAgent(agent) { this.agents.set(agent.id, agent); }

  create(definition, tenant_id) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO workflows (id, tenant_id, name, definition, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, tenant_id, definition.name, JSON.stringify(definition), now());
    return { id, ...definition };
  }

  list(tenant_id) {
    return this.db.prepare('SELECT * FROM workflows WHERE tenant_id=?').all(tenant_id);
  }

  get(id, tenant_id) {
    const w = this.db.prepare('SELECT * FROM workflows WHERE id=? AND tenant_id=?').get(id, tenant_id);
    if (!w) return null;
    return { ...w, definition: safeJson(w.definition, {}) };
  }

  start(workflow_id, tenant_id, input = {}) {
    const w = this.get(workflow_id, tenant_id);
    if (!w) return null;
    const id = randomUUID();
    const first = (w.definition.tasks || [])[0];
    this.db.prepare('INSERT INTO workflow_instances (id, workflow_id, tenant_id, status, input, output, current_task, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, workflow_id, tenant_id, 'running', JSON.stringify(input), '{}', first?.id || null, now(), now());
    return { id, workflow_id, status: 'running', current_task: first?.id };
  }

  async advance(instance_id, tenant_id, result = {}) {
    const inst = this.db.prepare('SELECT * FROM workflow_instances WHERE id=? AND tenant_id=?').get(instance_id, tenant_id);
    if (!inst) return null;
    const wf = this.get(inst.workflow_id, tenant_id);
    const tasks = wf.definition.tasks || [];
    const idx = tasks.findIndex((t) => t.id === inst.current_task);
    if (idx === -1) {
      this.db.prepare('UPDATE workflow_instances SET status=?, output=?, current_task=?, updated_at=? WHERE id=?')
        .run('completed', JSON.stringify(result), null, now(), instance_id);
      return { id: instance_id, status: 'completed', output: result };
    }
    // execute task
    const task = tasks[idx];
    const agent = this.agents.get(task.agent_id) || [...this.agents.values()].find((a) => a.role === task.role);
    const ctx = { ...safeJson(inst.input, {}), ...result };
    let taskResult = result;
    if (agent) {
      const r = await agent.run({ task: task.prompt || task.name, context: ctx });
      taskResult = r.output;
    }
    const next = tasks[idx + 1];
    this.db.prepare('UPDATE workflow_instances SET output=?, current_task=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(taskResult), next?.id || null, now(), instance_id);
    return { id: instance_id, status: next ? 'running' : 'completed', current_task: next?.id || null, lastResult: taskResult };
  }

  listInstances(tenant_id) {
    return this.db.prepare('SELECT * FROM workflow_instances WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 50').all(tenant_id);
  }
}

export default new WorkflowEngine();
export { WorkflowEngine };
