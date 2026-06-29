import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';
import bullmqQueue from './bullmqQueueService.js';

// Lightweight event-driven job queue using SQLite as persistent broker (BullMQ/Redis fallback)
class EventQueueService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_jobs (
        id TEXT PRIMARY KEY,
        queue TEXT,
        payload TEXT,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        result TEXT,
        scheduled_at TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_event_jobs_pop ON event_jobs (queue, status, scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_event_jobs_list ON event_jobs (queue, created_at DESC);
    `);
  }

  _useBullmq() {
    return bullmqQueue.available();
  }

  enqueue(queue, payload, { max_attempts = 3, delayMs = 0 } = {}) {
    if (this._useBullmq()) {
      return bullmqQueue.enqueue(queue, payload, { max_attempts, delayMs });
    }
    this.ensureTables();
    const id = randomUUID();
    const created_at = now();
    const scheduled_at = new Date(Date.now() + delayMs).toISOString();
    db.prepare('INSERT INTO event_jobs (id, queue, payload, status, attempts, max_attempts, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, queue, JSON.stringify(payload), 'pending', 0, max_attempts, scheduled_at, created_at, created_at);
    return { id, queue, status: 'pending' };
  }

  pop(queue) {
    if (this._useBullmq()) {
      return bullmqQueue.pop(queue);
    }
    this.ensureTables();
    const row = db.prepare("SELECT * FROM event_jobs WHERE queue=? AND status='pending' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 1").get(queue, now());
    if (!row) return null;
    db.prepare("UPDATE event_jobs SET status='active', updated_at=? WHERE id=?").run(now(), row.id);
    return { ...row, payload: JSON.parse(row.payload || '{}') };
  }

  complete(id, result, status = 'completed') {
    if (this._useBullmq()) {
      return bullmqQueue.complete(id, result, status);
    }
    this.ensureTables();
    db.prepare('UPDATE event_jobs SET status=?, result=?, updated_at=? WHERE id=?').run(status, JSON.stringify(result), now(), id);
    return { id, status };
  }

  fail(id, error) {
    if (this._useBullmq()) {
      return bullmqQueue.fail(id, error);
    }
    this.ensureTables();
    const row = db.prepare('SELECT * FROM event_jobs WHERE id=?').get(id);
    if (!row) return;
    const attempts = (row.attempts || 0) + 1;
    const newStatus = attempts >= row.max_attempts ? 'failed' : 'pending';
    const backoffMs = Math.pow(2, attempts) * 1000;
    const scheduled_at = new Date(Date.now() + backoffMs).toISOString();
    db.prepare('UPDATE event_jobs SET status=?, attempts=?, result=?, scheduled_at=?, updated_at=? WHERE id=?')
      .run(newStatus, attempts, JSON.stringify({ error }), scheduled_at, now(), id);
    return { id, status: newStatus, attempts };
  }

  list(queue, limit = 100) {
    if (this._useBullmq()) {
      return bullmqQueue.list(queue, limit);
    }
    this.ensureTables();
    return db.prepare('SELECT * FROM event_jobs WHERE queue=? ORDER BY created_at DESC LIMIT ?').all(queue, limit)
      .map(r => ({ ...r, payload: JSON.parse(r.payload || '{}'), result: JSON.parse(r.result || 'null') }));
  }
}

export default new EventQueueService();
