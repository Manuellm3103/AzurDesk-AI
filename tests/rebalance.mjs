import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import agentRegistry from '../src/services/agentRegistryService.js';
import helpdeskService from '../src/helpdesk/helpdeskService.js';
import teamRebalanceService from '../src/services/teamRebalanceService.js';

const TENANT = 'tenant-rebalance-1';

test('snapshot detecta carga y burnout', () => {
  agentRegistry.ensureDefaults(TENANT);
  const agents = agentRegistry.list(TENANT);
  const r = teamRebalanceService.snapshot(TENANT, agents);
  assert.equal(r.success, true);
  assert.ok(r.snapshots.length >= 4);
});

test('recommend sugiere mover ticket de agente sobrecargado a subcargado con skill match', () => {
  agentRegistry.ensureDefaults(TENANT);
  const agents = agentRegistry.list(TENANT);
  const specialist = agents.find((a) => a.role === 'specialist');
  const technician = agents.find((a) => a.role === 'technician');
  helpdeskService.createTicket({ tenant_id: TENANT, requester_email: 'a@b.com', requester_name: 'A', subject: 'Red lenta', body: 'La red está muy lenta en el piso 3', category: 'network', assignee_id: specialist.id });
  for (let i = 0; i < 15; i++) {
    helpdeskService.createTicket({ tenant_id: TENANT, requester_email: 'a@b.com', requester_name: 'A', subject: 'Red caída ' + i, body: 'La red está caída urgentemente', category: 'network', assignee_id: specialist.id });
  }
  const tickets = helpdeskService.listTickets({ tenant_id: TENANT }).tickets;
  const r = teamRebalanceService.recommend(TENANT, agents, tickets);
  assert.equal(r.success, true);
  assert.ok(r.moves.length > 0, 'debería sugerir al menos un movimiento');
});

test('apply ejecuta moves y guarda logs', () => {
  agentRegistry.ensureDefaults(TENANT);
  const agents = agentRegistry.list(TENANT);
  const specialist = agents.find((a) => a.role === 'specialist');
  const { ticket } = helpdeskService.createTicket({ tenant_id: TENANT, requester_email: 'a@b.com', requester_name: 'A', subject: 'Red caída', body: 'La red está caída', category: 'network', assignee_id: specialist.id });
  const moves = [{ ticket_id: ticket.id, from_agent_id: specialist.id, to_agent_id: agents[0].id, reason: 'test' }];
  const r = teamRebalanceService.apply(TENANT, moves, { id: 'admin' });
  assert.equal(r.count, 1);
  const t = helpdeskService.getTicket(ticket.id);
  assert.equal(t.assignee_id, agents[0].id);
  const logs = teamRebalanceService.logs(TENANT);
  assert.ok(logs.logs.length > 0);
});
