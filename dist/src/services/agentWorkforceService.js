import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

// Agent Workforce Scheduler: assign tasks to agents by role, availability and capacity.
class AgentWorkforceService {
  scheduleTask({ tenant_id, task_type, priority = 1, required_skills = [], payload }) {
    // find available agents with matching skills, lowest load
    const agents = db.prepare(`SELECT * FROM agents WHERE tenant_id = ? AND status IN ('idle','working')`).all(tenant_id);
    const scored = agents.map(a => {
      const skills = (a.skills || '').split(',').map(s => s.trim());
      const match = required_skills.length === 0 ? 1 : required_skills.filter(s => skills.includes(s)).length / required_skills.length;
      const load = this.agentLoad(tenant_id, a.id);
      return { ...a, match, load, score: match * 100 - load * 10 - (a.level || 1) };
    }).sort((a, b) => b.score - a.score);
    const chosen = scored[0];
    if (!chosen) return { success: false, error: 'no agent available' };
    const assignment_id = randomUUID();
    db.prepare(`INSERT INTO workforce_assignments (id, tenant_id, agent_id, task_type, priority, required_skills, payload, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(assignment_id, tenant_id, chosen.id, task_type, priority, required_skills.join(','), JSON.stringify(payload || {}), 'scheduled', now());
    // mark agent as working if not already
    if (chosen.status === 'idle') {
      db.prepare(`UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?`).run(assignment_id, chosen.id);
    }
    return { success: true, assignment_id, agent_id: chosen.id, agent_name: chosen.name, status: 'scheduled' };
  }

  agentLoad(tenant_id, agent_id) {
    const row = db.prepare(`SELECT COUNT(*) as c FROM workforce_assignments WHERE tenant_id = ? AND agent_id = ? AND status IN ('scheduled','in_progress')`).get(tenant_id, agent_id);
    return row ? row.c : 0;
  }

  listAssignments(tenant_id) {
    return db.prepare(`SELECT * FROM workforce_assignments WHERE tenant_id = ? ORDER BY created_at DESC`).all(tenant_id).map(r => ({
      ...r,
      payload: JSON.parse(r.payload || '{}'),
      required_skills: r.required_skills ? r.required_skills.split(',') : []
    }));
  }

  startAssignment(id) {
    db.prepare(`UPDATE workforce_assignments SET status = 'in_progress', updated_at = ? WHERE id = ?`).run(now(), id);
    const a = db.prepare(`SELECT * FROM workforce_assignments WHERE id = ?`).get(id);
    return a ? { success: true, assignment: a } : { success: false };
  }

  completeAssignment(id, result = {}) {
    db.prepare(`UPDATE workforce_assignments SET status = 'completed', result = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(result), now(), id);
    const a = db.prepare(`SELECT * FROM workforce_assignments WHERE id = ?`).get(id);
    if (a) {
      const remaining = this.agentLoad(a.tenant_id, a.agent_id);
      if (remaining === 0) {
        db.prepare(`UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?`).run(a.agent_id);
      }
    }
    return a ? { success: true, assignment: a } : { success: false };
  }
}

export default new AgentWorkforceService();
