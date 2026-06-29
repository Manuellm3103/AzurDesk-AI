import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson } from './_utils.js';

class AgentMeshService {
  publish(tenant_id, { agent_id, name, role, level, skills, endpoint, metadata }) {
    const id = randomUUID();
    const skillsJson = Array.isArray(skills) ? JSON.stringify(skills) : (skills || '[]');
    const existing = db.prepare('SELECT id FROM agent_mesh_nodes WHERE tenant_id = ? AND agent_id = ?').get(tenant_id, agent_id);
    if (existing) {
      db.prepare('UPDATE agent_mesh_nodes SET name=?, role=?, level=?, skills=?, endpoint=?, metadata=?, active=1, updated_at=? WHERE id=?')
        .run(name, role, level, skillsJson, endpoint || null, metadata ? JSON.stringify(metadata) : null, now(), existing.id);
      return { success: true, node: this.get(tenant_id, existing.id) };
    }
    db.prepare('INSERT INTO agent_mesh_nodes (id, tenant_id, agent_id, name, role, level, skills, availability, reputation, last_seen, endpoint, metadata, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, agent_id, name, role, level, skillsJson, 1.0, 0.0, now(), endpoint || null, metadata ? JSON.stringify(metadata) : null, 1, now(), now());
    return { success: true, node: this.get(tenant_id, id) };
  }

  get(tenant_id, id) {
    const row = db.prepare('SELECT * FROM agent_mesh_nodes WHERE tenant_id = ? AND id = ?').get(tenant_id, id);
    if (!row) return null;
    return this.hydrate(row);
  }

  getByAgentId(tenant_id, agent_id) {
    const row = db.prepare('SELECT * FROM agent_mesh_nodes WHERE tenant_id = ? AND agent_id = ?').get(tenant_id, agent_id);
    if (!row) return null;
    return this.hydrate(row);
  }

  list(tenant_id) {
    return db.prepare('SELECT * FROM agent_mesh_nodes WHERE tenant_id = ? AND active = 1 ORDER BY reputation DESC, availability DESC').all(tenant_id).map((r) => this.hydrate(r));
  }

  heartbeat(tenant_id, agent_id, { availability, reputation, metrics }) {
    const node = this.getByAgentId(tenant_id, agent_id);
    if (!node) return null;
    const meta = metrics ? JSON.stringify(metrics) : JSON.stringify(node.metadata || {});
    db.prepare('UPDATE agent_mesh_nodes SET availability = ?, reputation = ?, last_seen = ?, metadata = ?, updated_at = ? WHERE id = ?')
      .run(availability ?? node.availability, reputation ?? node.reputation, now(), meta, now(), node.id);
    return this.get(tenant_id, node.id);
  }

  deactivate(tenant_id, id) {
    db.prepare('UPDATE agent_mesh_nodes SET active = 0, updated_at = ? WHERE tenant_id = ? AND id = ?').run(now(), tenant_id, id);
    return { success: true };
  }

  rankForTicket(tenant_id, ticket) {
    const nodes = this.list(tenant_id);
    const tags = Array.isArray(ticket.tags) ? ticket.tags : safeJson(ticket.tags, []);
    const needSkills = new Set(tags.map((t) => t.toLowerCase()));
    const levelNeed = ticket.level || 1;
    const results = [];
    for (const node of nodes) {
      const skillScore = this.skillOverlap(needSkills, node.skills);
      const levelScore = node.level >= levelNeed ? 1 : node.level / levelNeed;
      const availabilityScore = node.availability;
      const reputationScore = node.reputation;
      const score = skillScore * 0.5 + levelScore * 0.25 + availabilityScore * 0.15 + reputationScore * 0.1;
      results.push({ node, score: Number(score.toFixed(4)), skillScore: Number(skillScore.toFixed(4)), levelScore: Number(levelScore.toFixed(4)) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  bestForTicket(tenant_id, ticket, threshold = 0.6) {
    const ranked = this.rankForTicket(tenant_id, ticket);
    const best = ranked[0];
    if (!best || best.score < threshold) return null;
    return best;
  }

  assign(tenant_id, ticket_id, node_id, reason, score) {
    const id = randomUUID();
    db.prepare('INSERT INTO agent_mesh_assignments (id, tenant_id, ticket_id, node_id, reason, score, accepted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, ticket_id, node_id, reason, score, 0, now());
    return { success: true, assignment: { id, ticket_id, node_id, reason, score } };
  }

  hydrate(row) {
    return { ...row, skills: safeJson(row.skills, []), metadata: safeJson(row.metadata, {}) };
  }

  skillOverlap(needSkills, agentSkills) {
    if (!needSkills.size || !agentSkills.length) return 0;
    const lower = agentSkills.map((s) => String(s).toLowerCase());
    const synonyms = {
      red: ['network', 'lan', 'wan', 'wifi'],
      network: ['red'],
      seguridad: ['security'],
      security: ['seguridad'],
      acceso: ['access', 'auth'],
      access: ['acceso', 'auth'],
      auth: ['acceso', 'access'],
      login: ['auth', 'access'],
      email: ['mail'],
      factura: ['billing'],
      lento: ['performance'],
      error: ['bug', 'failure'],
      bug: ['error', 'failure']
    };
    const expand = (s) => [s, ...(synonyms[s] || [])];
    let hits = 0;
    for (const s of needSkills) {
      const candidates = new Set(expand(s));
      if (lower.some((a) => candidates.has(a) || a.includes(s) || s.includes(a))) hits++;
    }
    return hits / Math.max(needSkills.size, agentSkills.length);
  }
}

export default new AgentMeshService();
