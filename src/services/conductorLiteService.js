import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';

// Conductor-lite: deterministic durable workflow engine built on durable executions.
// Adds workflow definition/versioning, DAG steps with dependencies, and replayable runActivity.
class ConductorLiteService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conductor_workflows (
        id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, version INTEGER DEFAULT 1,
        dag TEXT, compensation TEXT, enabled INTEGER DEFAULT 1,
        created_at TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conductor_workflows ON conductor_workflows (tenant_id, name, version);
      CREATE TABLE IF NOT EXISTS conductor_runs (
        id TEXT PRIMARY KEY, tenant_id TEXT, workflow_id TEXT, execution_id TEXT,
        status TEXT DEFAULT 'pending', context TEXT, result TEXT,
        created_at TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conductor_runs ON conductor_runs (tenant_id, workflow_id, status);
    `);
  }

  // Define or update a workflow DAG.
  // dag = { steps: [{ id, type='task'|'choice'|'sleep', deps:[], fn?:string, input?:{}, timeout_ms?:number }] }
  defineWorkflow(tenant_id, { name, version = 1, dag, compensation = [] }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare(`INSERT INTO conductor_workflows (id, tenant_id, name, version, dag, compensation, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tenant_id, name, version, JSON.stringify(dag), JSON.stringify(compensation), 1, now(), now());
    return { id, tenant_id, name, version };
  }

  getWorkflow(tenant_id, workflow_id) {
    this.ensureTables();
    const wf = db.prepare('SELECT * FROM conductor_workflows WHERE id=? AND tenant_id=?').get(workflow_id, tenant_id);
    if (!wf) return null;
    return { ...wf, dag: this._json(wf.dag), compensation: this._json(wf.compensation) };
  }

  listWorkflows(tenant_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM conductor_workflows WHERE tenant_id=? ORDER BY name, version')
      .all(tenant_id).map(r => ({ ...r, dag: this._json(r.dag), compensation: this._json(r.compensation) }));
  }

  // Start a new run using durable execution engine as the substrate.
  startRun(tenant_id, { workflow_id, context = {} }, durableExec) {
    this.ensureTables();
    const wf = this.getWorkflow(tenant_id, workflow_id);
    if (!wf) throw new Error('workflow not found');
    const runId = randomUUID();
    // Seed durable execution for this workflow run.
    const execution = durableExec.start(tenant_id, { name: `conductor:${wf.name}`, context: { workflow_id, runId, context }, max_attempts: 3 });
    db.prepare('INSERT INTO conductor_runs (id, tenant_id, workflow_id, execution_id, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(runId, tenant_id, workflow_id, execution.id, 'pending', JSON.stringify(context), now(), now());
    return { runId, executionId: execution.id, status: 'pending' };
  }

  // Execute next ready steps. Deterministic because runActivity is idempotent per (execution_id, seq).
  async advanceRun(tenant_id, runId, durableExec, handlers = {}) {
    this.ensureTables();
    const run = db.prepare('SELECT * FROM conductor_runs WHERE id=? AND tenant_id=?').get(runId, tenant_id);
    if (!run) throw new Error('run not found');
    const wf = this.getWorkflow(tenant_id, run.workflow_id);
    if (!wf) throw new Error('workflow not found');
    const dag = wf.dag;
    const execution = durableExec.get(tenant_id, run.execution_id);
    if (!execution) throw new Error('execution not found');

    const completedEvents = new Set((execution.events || []).filter(e => e.result !== null && e.result !== undefined).map(e => `${e.seq}:${e.type}`));
    const stepMap = new Map(dag.steps.map((s, i) => [s.id, { ...s, seq: i + 1 }]));

    const results = {};
    let progress = true;
    while (progress) {
      progress = false;
      for (const step of dag.steps) {
        const key = `${stepMap.get(step.id).seq}:${step.id}`;
        if (completedEvents.has(key) || results[step.id] !== undefined) continue;
        const depsReady = (step.deps || []).every(d => completedEvents.has(`${stepMap.get(d).seq}:${d}`) || results[d] !== undefined);
        if (!depsReady) continue;

        const input = { ...step.input, ...Object.fromEntries((step.deps || []).map(d => [d, results[d]])) };
        try {
          const fn = handlers[step.id] || this._defaultHandler(step);
          const { result } = await durableExec.runActivity(tenant_id, execution.id, { seq: stepMap.get(step.id).seq, type: step.id, fn, payload: input });
          results[step.id] = result;
          completedEvents.add(key);
          progress = true;
        } catch (err) {
          db.prepare('UPDATE conductor_runs SET status=?, result=?, updated_at=? WHERE id=?')
            .run('failed', JSON.stringify({ ...results, [step.id]: { error: err.message } }), now(), runId);
          return { runId, status: 'failed', error: err.message, results };
        }
      }
    }

    const allDone = dag.steps.every(s => completedEvents.has(`${stepMap.get(s.id).seq}:${s.id}`) || results[s.id] !== undefined);
    const status = allDone ? 'completed' : 'running';
    db.prepare('UPDATE conductor_runs SET status=?, result=?, updated_at=? WHERE id=?')
      .run(status, JSON.stringify(results), now(), runId);
    if (status === 'completed') durableExec.complete(tenant_id, execution.id, results);
    return { runId, status, results };
  }

  getRun(tenant_id, runId) {
    this.ensureTables();
    const run = db.prepare('SELECT * FROM conductor_runs WHERE id=? AND tenant_id=?').get(runId, tenant_id);
    if (!run) return null;
    return { ...run, context: this._json(run.context), result: this._json(run.result) };
  }

  _defaultHandler(step) {
    return async (payload) => {
      if (step.type === 'sleep') {
        await new Promise(r => setTimeout(r, step.ms || 0));
        return { slept: step.ms };
      }
      return { step: step.id, payload };
    };
  }

  _json(v) {
    if (v === null || v === undefined) return v;
    try { return JSON.parse(v); } catch { return v; }
  }
}

export default new ConductorLiteService();
export { ConductorLiteService };
