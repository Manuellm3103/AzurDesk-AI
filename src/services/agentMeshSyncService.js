import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

// Agent Mesh Sync: heartbeat and discovery of local agent nodes.
class AgentMeshSyncService {
  heartbeat({ tenant_id, agent_id, name, role, level, skills, endpoint, availability = 1.0, reputation = 0.5, metadata = {} }) {
    const t = now();
    const existing = db.prepare(`SELECT id FROM agent_mesh_nodes WHERE tenant_id = ? AND agent_id = ?`).get(tenant_id, agent_id);
    if (existing) {
      db.prepare(`UPDATE agent_mesh_nodes SET name = ?, role = ?, level = ?, skills = ?, availability = ?, reputation = ?, last_seen = ?, endpoint = ?, metadata = ?, active = 1, updated_at = ? WHERE id = ?`)
        .run(name, role, level, skills.join(','), availability, reputation, t, endpoint, JSON.stringify(metadata), t, existing.id);
      return { success: true, node_id: existing.id, action: 'updated' };
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO agent_mesh_nodes (id, tenant_id, agent_id, name, role, level, skills, availability, reputation, last_seen, endpoint, metadata, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(id, tenant_id, agent_id, name, role, level, skills.join(','), availability, reputation, t, endpoint, JSON.stringify(metadata), t, t);
    return { success: true, node_id: id, action: 'created' };
  }

  listActive(tenant_id, maxAgeMs = 60000) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    return db.prepare(`SELECT * FROM agent_mesh_nodes WHERE tenant_id = ? AND active = 1 AND last_seen > ? ORDER BY reputation DESC, availability DESC`).all(tenant_id, cutoff).map(r => ({
      ...r,
      skills: r.skills ? r.skills.split(',') : [],
      metadata: JSON.parse(r.metadata || '{}')
    }));
  }

  pruneInactive(maxAgeMs = 300000) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const r = db.prepare(`UPDATE agent_mesh_nodes SET active = 0 WHERE last_seen < ?`).run(cutoff);
    return { pruned: r.changes };
  }
}

export default new AgentMeshSyncService();
