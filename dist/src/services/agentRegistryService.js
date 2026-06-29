import { randomUUID } from 'crypto';
import db from './db.js';
import { now } from './_utils.js';

class AgentRegistryService {
  ensureDefaults(tenant_id) {
    const existing = db.prepare('SELECT COUNT(*) as c FROM agents WHERE tenant_id = ?').get(tenant_id).c;
    if (existing) return;
    const stmt = db.prepare('INSERT INTO agents (id, tenant_id, name, role, level, skills, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of DEFAULT_AGENTS) {
      stmt.run(randomUUID(), tenant_id, a.name, a.role, a.level, a.skills, 'idle', now(), now());
    }
  }

  list(tenant_id) {
    this.ensureDefaults(tenant_id);
    return db.prepare('SELECT * FROM agents WHERE tenant_id = ? ORDER BY level, name').all(tenant_id);
  }

  get(tenant_id, id) {
    return db.prepare('SELECT * FROM agents WHERE tenant_id = ? AND id = ?').get(tenant_id, id);
  }

  create(tenant_id, { name, role, level, skills }) {
    const id = randomUUID();
    db.prepare('INSERT INTO agents (id, tenant_id, name, role, level, skills, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, name, role, level, Array.isArray(skills) ? JSON.stringify(skills) : skills, 'idle', now(), now());
    return this.get(tenant_id, id);
  }

  updateStatus(tenant_id, id, { status, current_task_id }) {
    db.prepare('UPDATE agents SET status = ?, current_task_id = ?, last_heartbeat = ?, updated_at = ? WHERE tenant_id = ? AND id = ?')
      .run(status, current_task_id || null, now(), now(), tenant_id, id);
    return this.get(tenant_id, id);
  }

  heartbeat(tenant_id, id, metrics = {}) {
    const agent = this.get(tenant_id, id);
    if (!agent) return null;
    db.prepare('UPDATE agents SET last_heartbeat = ?, metrics = ?, updated_at = ? WHERE tenant_id = ? AND id = ?')
      .run(now(), JSON.stringify(metrics), now(), tenant_id, id);
    return this.get(tenant_id, id);
  }

  findBestForLevel(tenant_id, level) {
    this.ensureDefaults(tenant_id);
    return db.prepare('SELECT * FROM agents WHERE tenant_id = ? AND level >= ? AND status = \'idle\' ORDER BY level ASC, last_heartbeat DESC LIMIT 1').get(tenant_id, level);
  }

  fleetMetrics(tenant_id) {
    this.ensureDefaults(tenant_id);
    const rows = db.prepare('SELECT status, COUNT(*) as c FROM agents WHERE tenant_id = ? GROUP BY status').all(tenant_id);
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = r.c;
    const tasks = db.prepare('SELECT COUNT(*) as c FROM agent_claims WHERE tenant_id = ? AND status = \'active\'').get(tenant_id).c;
    return { agents: this.list(tenant_id).length, byStatus, active_claims: tasks };
  }
}

const DEFAULT_AGENTS = [
  { name: 'L1-FrontDesk', role: 'frontdesk', level: 1, skills: JSON.stringify(['triage','reply','classify']) },
  { name: 'L2-TechSupport', role: 'technician', level: 2, skills: JSON.stringify(['diagnose','kb_search','patch','network']) },
  { name: 'L3-Specialist', role: 'specialist', level: 3, skills: JSON.stringify(['network','security','root_cause','code_review','hotfix']) },
  { name: 'L0-Orchestrator', role: 'operator', level: 0, skills: JSON.stringify(['plan','delegate','review']) }
];

export default new AgentRegistryService();
