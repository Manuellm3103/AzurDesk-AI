import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

// A2A Standard Tasks service aligned with a2aproject/A2A protocol.
// Lifecycle: submitted -> working -> input-required -> completed | failed | canceled.
class A2AStandardService {
  _table() {
    return db.prepare(`INSERT INTO a2a_tasks
      (id, tenant_id, task_id, status, sender, receiver, payload, artifacts, messages, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  }

  submitTask({ tenant_id, sender, receiver, payload, task_id }) {
    const id = randomUUID();
    const t = now();
    const tid = task_id || `task-${Date.now()}`;
    db.prepare(`INSERT INTO a2a_tasks
      (id, tenant_id, task_id, status, sender, receiver, payload, artifacts, messages, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, tenant_id, tid, 'submitted', sender, receiver, JSON.stringify(payload || {}), '[]', '[]', t, t
    );
    return this.getTask(id);
  }

  getTask(id) {
    const row = db.prepare('SELECT * FROM a2a_tasks WHERE id = ?').get(id);
    if (!row) return null;
    return this._hydrate(row);
  }

  listTasks(tenant_id) {
    return db.prepare('SELECT * FROM a2a_tasks WHERE tenant_id = ? ORDER BY created_at DESC').all(tenant_id).map(r => this._hydrate(r));
  }

  updateTask(id, status, { message, artifact } = {}) {
    const task = this.getTask(id);
    if (!task) return null;
    const messages = [...task.messages];
    const artifacts = [...task.artifacts];
    if (message) messages.push({ ...message, at: now() });
    if (artifact) artifacts.push({ ...artifact, at: now() });
    const t = now();
    db.prepare('UPDATE a2a_tasks SET status = ?, messages = ?, artifacts = ?, updated_at = ? WHERE id = ?')
      .run(status, JSON.stringify(messages), JSON.stringify(artifacts), t, id);
    return this.getTask(id);
  }

  cancelTask(id) {
    return this.updateTask(id, 'canceled');
  }

  _hydrate(row) {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      task_id: row.task_id,
      status: row.status,
      sender: row.sender,
      receiver: row.receiver,
      payload: JSON.parse(row.payload || '{}'),
      messages: JSON.parse(row.messages || '[]'),
      artifacts: JSON.parse(row.artifacts || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export default new A2AStandardService();
