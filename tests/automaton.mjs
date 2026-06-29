import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import automatonService from '../src/services/automatonService.js';
import helpdeskService from '../src/helpdesk/helpdeskService.js';

const TENANT = 'tenant-automaton-1';

function cleanTenant(tenant_id) {
  db.prepare('DELETE FROM automaton_rules WHERE tenant_id=?').run(tenant_id);
  db.prepare('DELETE FROM automaton_runs WHERE tenant_id=?').run(tenant_id);
  db.prepare('DELETE FROM outbox WHERE tenant_id=?').run(tenant_id);
  db.prepare('DELETE FROM tickets WHERE tenant_id=?').run(tenant_id);
  db.prepare('DELETE FROM ticket_history WHERE ticket_id IN (SELECT id FROM tickets WHERE tenant_id=?)').run(tenant_id);
}

test('create rule y listar', () => {
  cleanTenant(TENANT);
  const r = automatonService.create(TENANT, {
    name: 'Crítico → Slack',
    condition: { priority: 'critical' },
    actions: [{ type: 'webhook', params: { url: 'https://hooks.slack.com/TEST', message: 'Ticket crítico creado' } }],
    priority: 10
  });
  assert.equal(r.success, true);
  assert.equal(r.rule.name, 'Crítico → Slack');
  const list = automatonService.list(TENANT);
  assert.ok(list.rules.length >= 1);
});

test('evaluate dispara webhook en ticket crítico', () => {
  cleanTenant(TENANT);
  automatonService.create(TENANT, {
    name: 'Crítico → Slack',
    condition: { priority: 'critica' },
    actions: [{ type: 'webhook', params: { url: 'https://hooks.slack.com/TEST', message: 'Ticket crítico' } }]
  });
  const { ticket } = helpdeskService.createTicket({
    tenant_id: TENANT,
    requester_email: 'a@b.com',
    requester_name: 'A',
    subject: 'PRODUCCIÓN CAÍDA',
    body: 'todo el sistema caído urgente',
    category: 'network'
  });
  assert.equal(ticket.priority, 'critica');
  const runs = automatonService.runs(TENANT);
  assert.ok(runs.runs.length > 0, 'debería haber corrido al menos una regla');
  const matched = runs.runs.filter((x) => x.matched === 1);
  assert.ok(matched.length > 0, 'debería haber hecho match');
  const out = automatonService.outbox(TENANT);
  assert.ok(out.items.some((i) => i.type === 'webhook'), 'debería haber creado un webhook en outbox');
});

test('acción escalate sube nivel del ticket', () => {
  cleanTenant(TENANT);
  automatonService.create(TENANT, {
    name: 'Alta → Escalate',
    condition: { priority: 'alta' },
    actions: [{ type: 'escalate', params: { level: 2 } }]
  });
  const { ticket } = helpdeskService.createTicket({
    tenant_id: TENANT,
    requester_email: 'a@b.com',
    requester_name: 'A',
    subject: 'urgente problema serio',
    body: 'el sistema está lento y afecta urgentemente a varios usuarios',
    category: 'general'
  });
  assert.equal(ticket.priority, 'alta');
  const t = helpdeskService.getTicket(ticket.id);
  assert.equal(t.level, 2);
});
