import db from './db.js';
import { now, safeJson } from './_utils.js';

const HORIZON_MS = 4 * 60 * 60 * 1000; // 4 horas
const PRIORITY_WEIGHT = {
  critica: 1.0,
  alta: 0.75,
  media: 0.45,
  baja: 0.2,
  critical: 1.0,
  high: 0.75,
  medium: 0.45,
  low: 0.2
};

function parseDue(dueAt) {
  if (!dueAt) return null;
  const ts = new Date(dueAt).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function timePressure(dueAt) {
  const due = parseDue(dueAt);
  if (!due) return 0.5; // sin SLA = riesgo moderado base
  const remaining = due - Date.now();
  if (remaining < 0) return 1.0; // vencido
  if (remaining < HORIZON_MS) return 0.8 + 0.2 * ((HORIZON_MS - remaining) / HORIZON_MS);
  return Math.max(0, 0.5 - (remaining - HORIZON_MS) / (24 * 60 * 60 * 1000));
}

function assignedRisk(assigneeId, tenantId, agentLookup) {
  if (!assigneeId) return 1.0;
  const agent = agentLookup ? agentLookup.get(assigneeId) : db.prepare('SELECT status, metrics FROM agents WHERE id = ? AND tenant_id = ?').get(assigneeId, tenantId);
  if (!agent) return 0.85;
  if (agent.status === 'offline' || agent.status === 'busy') return 0.7;
  const metrics = safeJson(agent.metrics, {});
  if (metrics.burnout_risk === 'critical' || metrics.burnout_risk === 'high') return 0.65;
  return 0.2;
}

export function scoreTicket(ticket, agentLookup) {
  const priority = (ticket.priority || 'baja').toLowerCase();
  const p = PRIORITY_WEIGHT[priority] || 0.2;
  const tp = timePressure(ticket.due_at);
  const ar = assignedRisk(ticket.assignee_id, ticket.tenant_id, agentLookup);
  const escalation = ticket.escalation_risk || 0;
  const sentiment = typeof ticket.sentiment === 'number' ? Math.max(0, -ticket.sentiment) : 0;
  const level = ticket.level >= 2 ? 0.2 : 0;
  const score = Math.min(1, (p * 0.35) + (tp * 0.25) + (ar * 0.2) + (escalation * 0.1) + (sentiment * 0.05) + (level * 0.05));
  return Number(score.toFixed(4));
}

export function scoreLegalCase(legalCase) {
  const priority = (legalCase.priority || 'low').toLowerCase();
  const p = PRIORITY_WEIGHT[priority] || 0.2;
  const tp = timePressure(legalCase.due_at);
  const owner = legalCase.owner_id ? 0.2 : 0.85;
  const risk = typeof legalCase.risk_score === 'number' ? legalCase.risk_score : 0.5;
  const approval = legalCase.approval_level >= 3 ? 0.15 : 0;
  const score = Math.min(1, (p * 0.25) + (tp * 0.25) + (owner * 0.2) + (risk * 0.2) + (approval * 0.1));
  return Number(score.toFixed(4));
}

export function buildRadar({ tenant_id }) {
  const nowMs = Date.now();
  const tickets = db.prepare('SELECT * FROM tickets WHERE tenant_id = ? AND status NOT IN (\'closed\',\'resolved\')').all(tenant_id);
  const cases = db.prepare('SELECT * FROM legal_cases WHERE tenant_id = ? AND status NOT IN (\'closed\',\'settled\',\'withdrawn\')').all(tenant_id);

  // Batch fetch all agents for this tenant once (eliminates N+1)
  const agents = db.prepare('SELECT id, status, metrics FROM agents WHERE tenant_id = ?').all(tenant_id);
  const agentLookup = new Map(agents.map((a) => [a.id, a]));

  const ticketItems = tickets.map((t) => ({
    type: 'ticket',
    id: t.id,
    title: t.subject,
    priority: t.priority,
    level: t.level,
    due_at: t.due_at,
    assignee_id: t.assignee_id,
    score: scoreTicket(t, agentLookup),
    signals: {
      priority_weight: PRIORITY_WEIGHT[(t.priority || '').toLowerCase()] || 0.2,
      time_pressure: timePressure(t.due_at),
      assigned_risk: assignedRisk(t.assignee_id, tenant_id, agentLookup),
      escalation_risk: t.escalation_risk || 0,
      sentiment_risk: typeof t.sentiment === 'number' ? Math.max(0, -t.sentiment) : 0
    }
  }));

  const caseItems = cases.map((c) => ({
    type: 'legal_case',
    id: c.id,
    title: c.title,
    priority: c.priority,
    due_at: c.due_at,
    owner_id: c.owner_id,
    score: scoreLegalCase(c),
    signals: {
      priority_weight: PRIORITY_WEIGHT[(c.priority || '').toLowerCase()] || 0.2,
      time_pressure: timePressure(c.due_at),
      owner_risk: c.owner_id ? 0.2 : 0.85,
      case_risk: typeof c.risk_score === 'number' ? c.risk_score : 0.5,
      approval_risk: c.approval_level >= 3 ? 0.15 : 0
    }
  }));

  const all = [...ticketItems, ...caseItems]
    .sort((a, b) => b.score - a.score);

  let critical = 0, high = 0;
  for (const item of all) {
    if (item.score >= 0.75) critical++;
    else if (item.score >= 0.55) high++;
  }

  return {
    tenant_id,
    generated_at: now(),
    horizon_hours: 4,
    total: all.length,
    critical,
    high,
    items: all.slice(0, 50)
  };
}

export default { scoreTicket, scoreLegalCase, buildRadar };
