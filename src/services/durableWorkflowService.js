import db from './db.js';
import { now, safeJson } from './_utils.js';
import { randomUUID } from 'crypto';

class DurableWorkflowService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS durable_workflows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        status TEXT,
        steps TEXT,
        current_step INTEGER DEFAULT 0,
        retries INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        compensation TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_durable_tenant ON durable_workflows (tenant_id, status);
    `);
  }

  create(tenant_id, { name, steps = [], max_retries = 3, compensation = [] }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO durable_workflows (id, tenant_id, name, status, steps, current_step, retries, max_retries, compensation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, name, 'running', JSON.stringify(steps), 0, 0, max_retries, JSON.stringify(compensation), now(), now());
    return { id, tenant_id, name, status: 'running' };
  }

  advance(workflowId, stepResult = {}) {
    const wf = db.prepare('SELECT * FROM durable_workflows WHERE id=?').get(workflowId);
    if (!wf) return null;
    const steps = JSON.parse(wf.steps || '[]');
    const current = wf.current_step + 1;
    const status = current >= steps.length ? 'completed' : 'running';
    db.prepare('UPDATE durable_workflows SET current_step=?, status=?, updated_at=? WHERE id=?').run(current, status, now(), workflowId);
    return { id: workflowId, current_step: current, status, stepResult };
  }

  fail(workflowId, error) {
    const wf = db.prepare('SELECT * FROM durable_workflows WHERE id=?').get(workflowId);
    if (!wf) return null;
    const newRetries = wf.retries + 1;
    const status = newRetries >= wf.max_retries ? 'failed' : 'running';
    db.prepare('UPDATE durable_workflows SET retries=?, status=?, updated_at=? WHERE id=?').run(newRetries, status, now(), workflowId);
    if (status === 'failed') this.compensate(workflowId);
    return { id: workflowId, status, retries: newRetries, error };
  }

  compensate(workflowId) {
    const wf = db.prepare('SELECT * FROM durable_workflows WHERE id=?').get(workflowId);
    if (!wf) return;
    const compensation = JSON.parse(wf.compensation || '[]');
    // Log compensation; in real implementation, execute compensating actions.
    db.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, details, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), wf.tenant_id, 'system', 'system', 'workflow.compensate', 'durable_workflow', workflowId, JSON.stringify({ compensation }), '', '', now());
  }

  list(tenant_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM durable_workflows WHERE tenant_id=? ORDER BY updated_at DESC').all(tenant_id);
  }
}

export default new DurableWorkflowService();
