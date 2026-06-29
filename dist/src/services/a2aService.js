import db from './db.js';
import { now, safeJson } from './_utils.js';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

// Agent-to-Agent (A2A) protocol: secure inter-tenant/agent messaging using signed cards.
class A2AService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS a2a_cards (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        from_agent TEXT,
        to_agent TEXT,
        to_tenant TEXT,
        task_type TEXT,
        payload TEXT,
        signature TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_a2a_to ON a2a_cards (to_tenant, to_agent, status);
      CREATE INDEX IF NOT EXISTS idx_a2a_from ON a2a_cards (tenant_id, from_agent, created_at);
    `);
  }

  // Issue a signed task card to another agent/tenant
  sendCard(tenant_id, { from_agent, to_tenant, to_agent, task_type, payload, secret }) {
    this.ensureTables();
    const id = randomUUID();
    const created_at = now();
    const signature = jwt.sign({ id, from_agent, to_tenant, to_agent, task_type, iat: Date.now() }, secret, { expiresIn: '1h' });
    db.prepare('INSERT INTO a2a_cards (id, tenant_id, from_agent, to_agent, to_tenant, task_type, payload, signature, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, from_agent, to_agent, to_tenant, task_type, JSON.stringify(payload), signature, 'pending', created_at, created_at);
    return { id, from_agent, to_tenant, to_agent, task_type, status: 'pending', created_at };
  }

  // Receive cards for this tenant/agent and verify signatures
  receiveCards(tenant_id, agent_id, secret) {
    this.ensureTables();
    const rows = db.prepare('SELECT * FROM a2a_cards WHERE to_tenant=? AND (to_agent=? OR to_agent=\'\' OR to_agent IS NULL) AND status=\'pending\' ORDER BY created_at ASC').all(tenant_id, agent_id || '');
    const verified = [];
    for (const row of rows) {
      try {
        jwt.verify(row.signature, secret);
        verified.push({ ...row, payload: JSON.parse(row.payload || '{}') });
      } catch {
        db.prepare('UPDATE a2a_cards SET status=\'rejected\', updated_at=? WHERE id=?').run(now(), row.id);
      }
    }
    return verified;
  }

  // Accept or reject a card and update status
  updateStatus(id, tenant_id, status, result = {}) {
    this.ensureTables();
    db.prepare('UPDATE a2a_cards SET status=?, updated_at=?, payload=json_set(payload, \'$.result\', json(?)) WHERE id=? AND to_tenant=?')
      .run(status, now(), JSON.stringify(result), id, tenant_id);
    return { id, status };
  }

  list(tenant_id, limit = 100) {
    this.ensureTables();
    return db.prepare('SELECT * FROM a2a_cards WHERE tenant_id=? OR to_tenant=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, tenant_id, limit)
      .map(r => ({ ...r, payload: safeJson(r.payload, {}) }));
  }
}

export default new A2AService();
