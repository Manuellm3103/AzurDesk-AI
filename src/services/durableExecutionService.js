import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';

// Durable Execution Engine (Temporal-lite) via event-sourcing in SQLite.
// Guarantees at-least-once execution with idempotent replay from events.
class DurableExecutionService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS durable_executions (
        id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, status TEXT DEFAULT 'pending',
        context TEXT, result TEXT, error TEXT, attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3, created_at TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_durable_execs ON durable_executions (tenant_id, status, created_at);
      CREATE TABLE IF NOT EXISTS durable_execution_events (
        id TEXT PRIMARY KEY, execution_id TEXT, seq INTEGER,
        type TEXT, payload TEXT, result TEXT, error TEXT, created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_durable_events ON durable_execution_events (execution_id, seq);
    `);
  }

  start(tenant_id, { name, context = {}, max_attempts = 3 }) {
    this.ensureTables();
    const id = randomUUID();
    const ctx = typeof context === 'string' ? context : JSON.stringify(context);
    db.prepare('INSERT INTO durable_executions (id, tenant_id, name, status, context, max_attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, name || 'execution', 'pending', ctx, max_attempts, now(), now());
    this._appendEvent(id, 0, 'started', { name, context: ctx });
    return this.get(tenant_id, id);
  }

  get(tenant_id, id) {
    this.ensureTables();
    const ex = db.prepare('SELECT * FROM durable_executions WHERE id=? AND tenant_id=?').get(id, tenant_id);
    if (!ex) return null;
    return this._hydrate(ex);
  }

  list(tenant_id, { status, limit = 50, offset = 0 } = {}) {
    this.ensureTables();
    let sql = 'SELECT * FROM durable_executions WHERE tenant_id=?';
    const args = [tenant_id];
    if (status) { sql += ' AND status=?'; args.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    args.push(limit, offset);
    return db.prepare(sql).all(...args).map(r => this._hydrate(r));
  }

  events(tenant_id, execution_id) {
    this.ensureTables();
    const ex = db.prepare('SELECT id FROM durable_executions WHERE id=? AND tenant_id=?').get(execution_id, tenant_id);
    if (!ex) return null;
    return db.prepare('SELECT * FROM durable_execution_events WHERE execution_id=? ORDER BY seq ASC').all(execution_id)
      .map(r => ({ ...r, payload: this._json(r.payload), result: this._json(r.result), error: this._json(r.error) }));
  }

  // Record an action event and update execution status/result atomically.
  // If seq is provided it is used as the event sequence (idempotency key).
  recordEvent(tenant_id, execution_id, { seq, type, payload, result, error }) {
    this.ensureTables();
    const ex = this.get(tenant_id, execution_id);
    if (!ex) return null;
    const eventSeq = seq ?? ((ex.events?.length || 0) + 1);
    this._appendEvent(execution_id, eventSeq, type, payload, result, error);

    let newStatus = error ? 'failed' : (type === 'completed' ? 'completed' : 'running');
    const newAttempts = type === 'attempt' ? (ex.attempts || 0) + 1 : (ex.attempts || 0);
    const resultStr = result ? (typeof result === 'string' ? result : JSON.stringify(result)) : ex.result;
    const errorStr = error ? (typeof error === 'string' ? error : JSON.stringify(error)) : ex.error;

    // Auto-retry if failed and attempts remaining
    if (error && newAttempts < (ex.max_attempts || 3)) {
      newStatus = 'pending';
    }

    db.prepare('UPDATE durable_executions SET status=?, attempts=?, result=?, error=?, updated_at=? WHERE id=? AND tenant_id=?')
      .run(newStatus, newAttempts, resultStr, errorStr, now(), execution_id, tenant_id);

    return this.get(tenant_id, execution_id);
  }

  // Idempotently run an activity using the provided async function.
  // If the same seq was already completed, replay stored result instead of re-executing.
  async runActivity(tenant_id, execution_id, { seq, type, fn, payload }) {
    this.ensureTables();
    const existing = db.prepare('SELECT * FROM durable_execution_events WHERE execution_id=? AND seq=? AND type=? AND result IS NOT NULL').get(execution_id, seq, type);
    if (existing) {
      return { replay: true, result: this._json(existing.result) };
    }
    try {
      const result = await fn(payload);
      this.recordEvent(tenant_id, execution_id, { seq, type, payload, result });
      return { replay: false, result };
    } catch (err) {
      this.recordEvent(tenant_id, execution_id, { type, payload, error: { message: err.message, stack: err.stack } });
      throw err;
    }
  }

  complete(tenant_id, execution_id, result) {
    this.ensureTables();
    this.recordEvent(tenant_id, execution_id, { type: 'completed', payload: {}, result });
    db.prepare('UPDATE durable_executions SET status=?, result=?, updated_at=? WHERE id=? AND tenant_id=?')
      .run('completed', result ? JSON.stringify(result) : null, now(), execution_id, tenant_id);
    return this.get(tenant_id, execution_id);
  }

  delete(tenant_id, id) {
    this.ensureTables();
    const info = db.prepare('DELETE FROM durable_executions WHERE id=? AND tenant_id=?').run(id, tenant_id);
    if (info.changes > 0) db.prepare('DELETE FROM durable_execution_events WHERE execution_id=?').run(id);
    return info.changes > 0;
  }

  _appendEvent(execution_id, seq, type, payload, result, error) {
    const id = randomUUID();
    const payloadStr = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null;
    const resultStr = result ? (typeof result === 'string' ? result : JSON.stringify(result)) : null;
    const errorStr = error ? (typeof error === 'string' ? error : JSON.stringify(error)) : null;
    db.prepare('INSERT INTO durable_execution_events (id, execution_id, seq, type, payload, result, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, execution_id, seq, type, payloadStr, resultStr, errorStr, now());
  }

  _hydrate(row) {
    const events = db.prepare('SELECT * FROM durable_execution_events WHERE execution_id=? ORDER BY seq ASC').all(row.id)
      .map(r => ({ ...r, payload: this._json(r.payload), result: this._json(r.result), error: this._json(r.error) }));
    return {
      ...row,
      context: this._json(row.context),
      result: this._json(row.result),
      error: row.error,
      events
    };
  }

  _json(v) {
    if (v === null || v === undefined) return v;
    try { return JSON.parse(v); } catch { return v; }
  }
}

export default new DurableExecutionService();
