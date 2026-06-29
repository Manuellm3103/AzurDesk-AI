import db from './db.js';
import { now } from './_utils.js';

// Stalled Session Monitor: detect sessions without heartbeat and recover/notify.
class StalledSessionService {
  constructor() {
    this.thresholdMs = 5 * 60 * 1000; // 5 minutes
  }

  detect({ tenant_id, maxAgeMs } = {}) {
    const threshold = new Date(Date.now() - (maxAgeMs || this.thresholdMs)).toISOString();
    let sql = `SELECT * FROM chat_sessions WHERE status IN ('active','handoff') AND (last_heartbeat_at IS NULL OR last_heartbeat_at < ?)`;
    const params = [threshold];
    if (tenant_id) {
      sql += ' AND tenant_id = ?';
      params.push(tenant_id);
    }
    return db.prepare(sql).all(...params);
  }

  markStalled(session_id, reason = 'no heartbeat') {
    const t = now();
    const r = db.prepare(`UPDATE chat_sessions SET status='stalled', stalled_count = COALESCE(stalled_count,0)+1, updated_at=? WHERE id=? AND status IN ('active','handoff')`).run(t, session_id);
    return { success: r.changes > 0, session_id, reason, changes: r.changes };
  }

  recover(session_id) {
    const t = now();
    db.prepare(`UPDATE chat_sessions SET status='active', last_heartbeat_at=?, stalled_count=0, updated_at=? WHERE id=?`).run(t, t, session_id);
    return { success: true, session_id, status: 'active' };
  }

  runSweep({ tenant_id, maxAgeMs } = {}) {
    const stalled = this.detect({ tenant_id, maxAgeMs });
    const results = [];
    for (const s of stalled) {
      results.push(this.markStalled(s.id, 'heartbeat timeout'));
    }
    return { success: true, checked: stalled.length, marked: results.filter(r => r.success).length, results };
  }
}

export default new StalledSessionService();
