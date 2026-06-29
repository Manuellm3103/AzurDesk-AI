import db from '../services/db.js';
import { randomUUID } from 'crypto';
import { now, safeJson } from '../services/_utils.js';
import Sentiment from 'sentiment';
import { classifyPriority, predictEscalation, routeToLevel } from '../ml/ticketClassifier.js';
import automatonService from '../services/automatonService.js';
import agentMeshService from '../services/agentMeshService.js';

const sentimentAnalyzer = new Sentiment();

const LEVEL_SLA = { 1: 240, 2: 120, 3: 60 };
const STATUS_FLOW = { backlog: 'todo', todo: 'in_progress', in_progress: 'review', review: 'done', done: 'done' };
const KANBAN_COLUMNS = ['backlog', 'todo', 'in_progress', 'review', 'done'];

class HelpdeskService {
  createTicket({ tenant_id, requester_email, requester_name, subject, body, category = 'general', channel = 'web', assignee_id = '' }) {
    const sentiment = this.analyzeSentiment(body);
    const priority = classifyPriority({ subject, body, sentiment });
    const level = routeToLevel({ category, sentiment, priority });
    const escalationRisk = predictEscalation({ subject, body, sentiment, priority, level });
    const id = randomUUID();
    const t = now();
    const sla = LEVEL_SLA[level];
    const due = new Date(Date.now() + sla * 60000).toISOString();

    db.prepare(`INSERT INTO tickets
      (id, tenant_id, requester_email, requester_name, subject, body, status, priority, level, category,
       assignee_id, sla_minutes, due_at, sentiment, escalation_risk, tags, channel, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, tenant_id, requester_email, requester_name, subject, body, 'backlog', priority, level, category,
      assignee_id, sla, due, sentiment.score, escalationRisk, JSON.stringify(this.extractTags(subject + ' ' + body)),
      channel, t, t
    );
    this.logHistory(id, 'created', null, 'backlog', assignee_id || 'system');
    const ticket = this.getTicket(id);
    // Run automaton rules synchronously
    automatonService.run(tenant_id, ticket, { id: assignee_id || 'system' });
    // Agent Mesh auto-escalation for high-priority / high-level tickets
    if ((priority === 'critica' || priority === 'alta' || level >= 2) && !assignee_id) {
      const best = agentMeshService.bestForTicket(tenant_id, ticket, 0.6);
      if (best) {
        db.prepare('UPDATE tickets SET level=?, assignee_id=?, updated_at=? WHERE id=?').run(Math.max(level, best.node.level), best.node.agent_id, now(), id);
        agentMeshService.assign(tenant_id, id, best.node.id, `mesh auto-rank: ${best.score}`, best.score);
        this.logHistory(id, 'mesh_assigned', null, `agent:${best.node.agent_id}|score:${best.score}`, 'mesh');
      }
    }
    return { success: true, ticket: this.getTicket(id) };
  }

  analyzeSentiment(text) {
    return sentimentAnalyzer.analyze(text || '');
  }

  extractTags(text) {
    const keywords = ['login', 'error', 'factura', 'email', 'red', 'lento', 'seguridad', 'acceso', 'bug', 'feature'];
    const lower = (text || '').toLowerCase();
    return keywords.filter((k) => lower.includes(k));
  }

  getTicket(id) {
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if (!t) return { error: 'Ticket no encontrado' };
    return this.hydrateTicket(t);
  }

  listTickets({ tenant_id, status, level, assignee_id, priority, limit = 100, offset = 0 } = {}) {
    let sql = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    if (tenant_id) { sql += ' AND tenant_id=?'; params.push(tenant_id); }
    if (status) { sql += ' AND status=?'; params.push(status); }
    if (level) { sql += ' AND level=?'; params.push(Number(level)); }
    if (assignee_id) { sql += ' AND assignee_id=?'; params.push(assignee_id); }
    if (priority) { sql += ' AND priority=?'; params.push(priority); }
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    return { success: true, tickets: db.prepare(sql).all(...params, Number(limit), Number(offset)).map((r) => this.hydrateTicket(r)) };
  }

  updateTicket(id, fields, actor) {
    const t = this.getTicket(id);
    if (t.error) return t;
    const nowStr = now();
    db.prepare(`UPDATE tickets SET status=?, priority=?, level=?, assignee_id=?, category=?, updated_at=?
      WHERE id=?`).run(
      fields.status ?? t.status,
      fields.priority ?? t.priority,
      fields.level ?? t.level,
      fields.assignee_id ?? t.assignee_id,
      fields.category ?? t.category,
      nowStr, id
    );
    this.logHistory(id, 'updated', JSON.stringify(t), JSON.stringify(this.getTicket(id)), actor?.id || 'system');
    return { success: true, ticket: this.getTicket(id) };
  }

  escalateTicket(id, { level, reason }, actor) {
    const ticket = this.getTicket(id);
    if (ticket.error) return ticket;
    const newLevel = Math.min(3, Math.max(1, Number(level)));
    const sla = LEVEL_SLA[newLevel];
    const due = new Date(Date.now() + sla * 60000).toISOString();
    db.prepare('UPDATE tickets SET level=?, sla_minutes=?, due_at=?, updated_at=? WHERE id=?').run(newLevel, sla, due, now(), id);
    this.logHistory(id, 'escalated', `level:${ticket.level}`, `level:${newLevel}`, actor?.id || 'system');
    return { success: true, ticket: this.getTicket(id), reason };
  }

  handoffTicket(id, { from_agent_id, to_agent_id, to_level, note }, actor) {
    const ticket = this.getTicket(id);
    if (ticket.error) return ticket;
    const newLevel = to_level ? Math.min(3, Math.max(1, Number(to_level))) : ticket.level;
    db.prepare('UPDATE tickets SET level=?, assignee_id=?, status=?, updated_at=? WHERE id=?').run(newLevel, to_agent_id, 'en_progreso', now(), id);
    this.logHistory(id, 'handoff', `agent:${from_agent_id}`, `agent:${to_agent_id}|level:${newLevel}`, actor?.id || 'system');
    if (note) this.addComment({ ticket_id: id, author_id: actor?.id || 'system', author_name: 'handoff', body: note, is_internal: true });
    return { success: true, ticket: this.getTicket(id), handoff: { from_agent_id, to_agent_id, to_level: newLevel } };
  }

  addComment({ ticket_id, author_id, author_name, body, is_internal = false }) {
    const id = randomUUID();
    const sent = this.analyzeSentiment(body);
    db.prepare('INSERT INTO ticket_comments (id, ticket_id, author_id, author_name, body, is_internal, sentiment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, ticket_id, author_id, author_name, body, Number(is_internal), sent.score, now()
    );
    db.prepare('UPDATE tickets SET updated_at=? WHERE id=?').run(now(), ticket_id);
    return { success: true, comment: this.getComment(id) };
  }

  getComment(id) {
    return db.prepare('SELECT * FROM ticket_comments WHERE id=?').get(id);
  }

  listComments(ticket_id) {
    return { success: true, comments: db.prepare('SELECT * FROM ticket_comments WHERE ticket_id=? ORDER BY created_at').all(ticket_id) };
  }

  logHistory(ticket_id, action, from_value, to_value, actor_id) {
    db.prepare('INSERT INTO ticket_history (id, ticket_id, action, from_value, to_value, actor_id, actor_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      randomUUID(), ticket_id, action, from_value, to_value, actor_id, actor_id, now()
    );
  }

  getMetrics({ tenant_id, days = 7 } = {}) {
    const total = db.prepare('SELECT COUNT(*) c FROM tickets WHERE tenant_id=?').get(tenant_id).c;
    const open = db.prepare("SELECT COUNT(*) c FROM tickets WHERE tenant_id=? AND status NOT IN ('done','cerrado','resuelto')").get(tenant_id).c;
    const byLevel = db.prepare('SELECT level, COUNT(*) c FROM tickets WHERE tenant_id=? GROUP BY level').all(tenant_id);
    const avgSentiment = db.prepare('SELECT AVG(sentiment) s FROM tickets WHERE tenant_id=?').get(tenant_id).s || 0;
    const breached = db.prepare('SELECT COUNT(*) c FROM tickets WHERE tenant_id=? AND due_at < datetime(\'now\') AND status NOT IN (\'done\',\'cerrado\',\'resuelto\')').get(tenant_id).c;
    return { total, open, breached, avgSentiment: Number(avgSentiment.toFixed(3)), byLevel };
  }

  kanban(tenant_id) {
    const columns = {};
    for (const col of KANBAN_COLUMNS) columns[col] = [];
    const rows = db.prepare('SELECT * FROM tickets WHERE tenant_id=? ORDER BY updated_at DESC').all(tenant_id);
    for (const t of rows) {
      const col = KANBAN_COLUMNS.includes(t.status) ? t.status : 'backlog';
      columns[col].push(this.hydrateTicket(t));
    }
    return { success: true, columns, order: KANBAN_COLUMNS };
  }

  moveTicket(id, { status }, actor) {
    const ticket = this.getTicket(id);
    if (ticket.error) return ticket;
    const valid = KANBAN_COLUMNS.includes(status);
    if (!valid) return { success: false, error: 'Estado inválido' };
    db.prepare('UPDATE tickets SET status=?, updated_at=? WHERE id=?').run(status, now(), id);
    this.logHistory(id, 'moved', ticket.status, status, actor?.id || 'system');
    return { success: true, ticket: this.getTicket(id) };
  }

  hydrateTicket(t) {
    return { ...t, tags: safeJson(t.tags, []) };
  }
}

export default new HelpdeskService();
