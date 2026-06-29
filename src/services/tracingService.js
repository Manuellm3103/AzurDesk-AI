import db from './db.js';
import { now, safeJson } from './_utils.js';
import { randomUUID } from 'crypto';

class TracingService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        run_id TEXT,
        parent_id TEXT,
        agent_id TEXT,
        step TEXT,
        state TEXT,
        input TEXT,
        output TEXT,
        latency_ms INTEGER,
        cost REAL,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_traces_run ON traces (tenant_id, run_id);
      CREATE INDEX IF NOT EXISTS idx_traces_parent ON traces (tenant_id, parent_id);
    `);
  }

  startSpan(tenant_id, { run_id, parent_id = null, agent_id, step, input = '' }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO traces (id, tenant_id, run_id, parent_id, agent_id, step, state, input, output, latency_ms, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, run_id, parent_id, agent_id, step, 'started', input, '', 0, 0, now());
    return { id, start: Date.now() };
  }

  endSpan(span_id, { output = '', cost = 0 }) {
    const latency = Date.now() - (this.getStart(span_id) || Date.now());
    db.prepare('UPDATE traces SET state=?, output=?, latency_ms=?, cost=? WHERE id=?').run('completed', output, latency, cost, span_id);
    return { span_id, latency_ms: latency, cost };
  }

  getStart(span_id) {
    const row = db.prepare('SELECT created_at FROM traces WHERE id=?').get(span_id);
    return row ? new Date(row.created_at).getTime() : null;
  }

  getRun(tenant_id, run_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM traces WHERE tenant_id=? AND run_id=? ORDER BY created_at').all(tenant_id, run_id);
  }

  listSpans(tenant_id, { limit = 50 } = {}) {
    this.ensureTables();
    return db.prepare('SELECT * FROM traces WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, limit)
      .map(r => ({ ...r, input: safeJson(r.input, r.input), output: safeJson(r.output, r.output) }));
  }
}

export default new TracingService();
