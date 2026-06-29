import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';

class HandoffService {
  constructor() {
    this.levelMap = { l1: 1, l2: 2, l3: 3, manager: 4 };
  }

  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS handoffs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        ticket_id TEXT,
        from_agent TEXT,
        from_level INTEGER,
        to_agent TEXT,
        to_level INTEGER,
        reason TEXT,
        context TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_handoffs_ticket ON handoffs (tenant_id, ticket_id);
    `);
  }

  escalate(tenant_id, { ticket_id, from_agent, from_level = 1, to_level = 2, reason = '', context = '' }) {
    this.ensureTables();
    const id = randomUUID();
    // find best target agent by level
    const target = db.prepare('SELECT id FROM agents WHERE tenant_id=? AND level=? ORDER BY created_at ASC LIMIT 1').get(tenant_id, to_level);
    const to_agent = target?.id || from_agent;
    db.prepare('INSERT INTO handoffs (id, tenant_id, ticket_id, from_agent, from_level, to_agent, to_level, reason, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, ticket_id, from_agent, from_level, to_agent, to_level, reason, context, now());
    // update ticket assignment
    if (target) {
      db.prepare('UPDATE tickets SET assignee_id=?, level=?, updated_at=? WHERE id=? AND tenant_id=?').run(to_agent, to_level, now(), ticket_id, tenant_id);
    }
    return { id, ticket_id, from_agent, to_agent, to_level, reason };
  }

  history(tenant_id, ticket_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM handoffs WHERE tenant_id=? AND ticket_id=? ORDER BY created_at').all(tenant_id, ticket_id);
  }
}

export default new HandoffService();
