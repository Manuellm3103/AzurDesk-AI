import { randomUUID } from 'crypto';
import db from './db.js';
import { now } from './_utils.js';

// Surprising feature: AI-driven team rebalancing with burnout detection
class TeamRebalanceService {
  constructor(database = db) {
    this.db = database;
  }

  // Compute health score per agent based on ticket load, breaches, sentiment
  snapshot(tenant_id, agents = []) {
    const stmt = this.db.prepare('INSERT INTO agent_health_snapshots (id, tenant_id, agent_id, load_score, burnout_risk, open_tickets, breached_tickets, avg_sentiment, last_heartbeat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const results = [];
    for (const agent of agents) {
      const open = this.db.prepare("SELECT COUNT(*) c FROM tickets WHERE tenant_id=? AND assignee_id=? AND status NOT IN ('done','cerrado','resuelto')").get(tenant_id, agent.id).c;
      const breached = this.db.prepare("SELECT COUNT(*) c FROM tickets WHERE tenant_id=? AND assignee_id=? AND status NOT IN ('done','cerrado','resuelto') AND due_at < datetime('now')").get(tenant_id, agent.id).c;
      const avgSent = this.db.prepare('SELECT AVG(sentiment) s FROM tickets WHERE tenant_id=? AND assignee_id=? AND status NOT IN (?, ?, ?)').get(tenant_id, agent.id, 'done', 'cerrado', 'resuelto').s || 0;
      const loadScore = open * 1.0 + breached * 3.0 + Math.max(0, -avgSent) * 2.0;
      let risk = 'low';
      if (loadScore > 15 || breached >= 3) risk = 'critical';
      else if (loadScore > 8 || breached >= 1) risk = 'high';
      else if (loadScore > 4) risk = 'medium';
      const id = randomUUID();
      stmt.run(id, tenant_id, agent.id, loadScore, risk, open, breached, Number(avgSent.toFixed(3)), agent.last_heartbeat || now(), now());
      results.push({ id, agent_id: agent.id, load_score: loadScore, burnout_risk: risk, open_tickets: open, breached_tickets: breached, avg_sentiment: Number(avgSent.toFixed(3)) });
    }
    return { success: true, snapshots: results };
  }

  // Recommend moves: overloaded -> underloaded, matching skills to ticket tags
  recommend(tenant_id, agents = [], tickets = []) {
    const snapshots = this.snapshot(tenant_id, agents).snapshots.sort((a, b) => b.load_score - a.load_score);
    if (!snapshots.length) return { success: true, moves: [] };
    const overloaded = snapshots.filter((s) => s.burnout_risk === 'critical' || s.burnout_risk === 'high');
    const underloaded = snapshots.filter((s) => s.burnout_risk === 'low').sort((a, b) => a.load_score - b.load_score);
    const moves = [];
    for (const over of overloaded) {
      const candidateTickets = tickets.filter((t) => t.assignee_id === over.agent_id && t.status !== 'done');
      for (const ticket of candidateTickets) {
        const best = underloaded.find((u) => {
          const agent = agents.find((a) => a.id === u.agent_id);
          if (!agent) return false;
          const skills = Array.isArray(agent.skills) ? agent.skills : JSON.parse(agent.skills || '[]');
          return skills.some((s) => (ticket.tags || []).includes(s) || ticket.category === s);
        });
        if (best) {
          moves.push({
            ticket_id: ticket.id,
            from_agent_id: over.agent_id,
            to_agent_id: best.agent_id,
            reason: `Carga crítica (${over.load_score}) + skill match`
          });
          if (moves.length >= 5) break;
        }
      }
      if (moves.length >= 5) break;
    }
    return { success: true, moves };
  }

  apply(tenant_id, moves, actor) {
    const update = this.db.prepare('UPDATE tickets SET assignee_id=?, status=?, updated_at=? WHERE id=? AND tenant_id=?');
    const log = this.db.prepare('INSERT INTO team_rebalance_logs (id, tenant_id, from_agent_id, to_agent_id, ticket_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const applied = [];
    for (const m of moves) {
      update.run(m.to_agent_id, 'todo', now(), m.ticket_id, tenant_id);
      log.run(randomUUID(), tenant_id, m.from_agent_id, m.to_agent_id, m.ticket_id, m.reason, now());
      applied.push(m);
    }
    return { success: true, applied, count: applied.length };
  }

  rebalance(tenant_id, agents, tickets, actor) {
    const { moves } = this.recommend(tenant_id, agents, tickets);
    if (!moves.length) return { success: true, applied: [], message: 'Sin rebalances necesarios' };
    return this.apply(tenant_id, moves, actor);
  }

  logs(tenant_id, limit = 50) {
    return { success: true, logs: this.db.prepare('SELECT * FROM team_rebalance_logs WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, limit) };
  }

  latestSnapshots(tenant_id, limit = 100) {
    return { success: true, snapshots: this.db.prepare('SELECT * FROM agent_health_snapshots WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, limit) };
  }
}

export default new TeamRebalanceService();
export { TeamRebalanceService };
