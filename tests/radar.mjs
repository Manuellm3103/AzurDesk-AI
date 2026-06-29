import assert from 'node:assert/strict';
import { test } from 'node:test';
import radarService, { scoreTicket, scoreLegalCase } from '../src/services/radarService.js';
import db from '../src/services/db.js';

const TENANT = 'tenant-radar-1';

function clean() {
  db.prepare('DELETE FROM tickets WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM legal_cases WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM agents WHERE tenant_id = ?').run(TENANT);
}

test('scoreTicket prioriza críticos sin asignar y próximos a vencer', () => {
  const futureNear = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const critical = scoreTicket({ tenant_id: TENANT, priority: 'critica', due_at: futureNear, assignee_id: null, escalation_risk: 0.8, sentiment: -0.6, level: 1 });
  assert.ok(critical >= 0.7, `score crítico ${critical}`);

  const low = scoreTicket({ tenant_id: TENANT, priority: 'baja', due_at: null, assignee_id: 'agent-1', escalation_risk: 0, sentiment: 0.1, level: 1 });
  assert.ok(low < 0.4, `score bajo ${low}`);
});

test('scoreLegalCase detecta casos sin owner y vencidos', () => {
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const high = scoreLegalCase({ tenant_id: TENANT, priority: 'critical', due_at: past, owner_id: null, risk_score: 0.9, approval_level: 3 });
  assert.ok(high >= 0.6, `score caso alto ${high}`);

  const low = scoreLegalCase({ tenant_id: TENANT, priority: 'low', due_at: null, owner_id: 'lawyer-1', risk_score: 0.2, approval_level: 1 });
  assert.ok(low < 0.4, `score caso bajo ${low}`);
});

test('buildRadar ordena items por score descendente', () => {
  clean();
  const soon = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, due_at, assignee_id, escalation_risk, sentiment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('ticket-1', TENANT, 'Servidor caído', 'body', 'open', 'critica', 1, soon, null, 0.9, -0.7, new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, due_at, assignee_id, escalation_risk, sentiment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('ticket-2', TENANT, 'Duda menú', 'body', 'open', 'baja', 1, null, 'agent-1', 0, 0.2, new Date().toISOString(), new Date().toISOString());

  const r = radarService.buildRadar({ tenant_id: TENANT });
  assert.equal(r.tenant_id, TENANT);
  assert.equal(r.total, 2);
  assert.ok(r.items[0].score >= r.items[1].score);
  assert.equal(r.items[0].id, 'ticket-1');
  assert.ok(r.critical >= 1);
});

test('buildRadar incluye casos legales activos', () => {
  clean();
  const past = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, due_at, assignee_id, escalation_risk, sentiment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('ticket-quiet', TENANT, 'Ticket tranquilo', 'body', 'open', 'baja', 1, null, 'agent-1', 0, 0.1, new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO legal_cases (id, tenant_id, case_number, title, summary, type, status, priority, risk_score, owner_id, due_at, approval_level, requester_email, requester_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('case-1', TENANT, 'LEG-1', 'Demanda laboral vencida', 'resumen', 'litigation', 'discovery', 'critical', 0.95, null, past, 3, 'rrhh@corp.com', 'RRHH', new Date().toISOString(), new Date().toISOString());

  const r = radarService.buildRadar({ tenant_id: TENANT });
  const legal = r.items.find((i) => i.type === 'legal_case');
  assert.ok(legal);
  assert.ok(legal.score > r.items.find((i) => i.type === 'ticket').score);
});

test('buildRadar respeta tenant boundary', () => {
  clean();
  const id1 = `tenant-radar-t1-${Date.now()}`;
  const id2 = `tenant-radar-t2-${Date.now()}`;
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, due_at, assignee_id, escalation_risk, sentiment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id1, TENANT, 'Ticket t1', 'body', 'open', 'critica', 1, new Date().toISOString(), null, 0.9, -0.5, new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, due_at, assignee_id, escalation_risk, sentiment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id2, 'tenant-radar-2', 'Ticket t2', 'body', 'open', 'critica', 1, new Date().toISOString(), null, 0.9, -0.5, new Date().toISOString(), new Date().toISOString());

  const r = radarService.buildRadar({ tenant_id: TENANT });
  assert.equal(r.total, 1);
  assert.equal(r.items[0].id, id1);
});
