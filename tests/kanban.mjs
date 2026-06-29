import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import helpdeskService from '../src/helpdesk/helpdeskService.js';

const TENANT = 'tenant-kanban-1';

test('kanban agrupa tickets por columnas', () => {
  helpdeskService.createTicket({ tenant_id: TENANT, requester_email: 'a@b.com', requester_name: 'A', subject: 'T1', body: 'body largo suficiente' });
  helpdeskService.createTicket({ tenant_id: TENANT, requester_email: 'c@d.com', requester_name: 'C', subject: 'T2', body: 'body largo suficiente' });
  const kb = helpdeskService.kanban(TENANT);
  assert.equal(kb.success, true);
  assert.ok(kb.columns.backlog.length >= 2);
});

test('moveTicket mueve entre columnas', () => {
  const { ticket } = helpdeskService.createTicket({ tenant_id: TENANT, requester_email: 'e@f.com', requester_name: 'E', subject: 'T3', body: 'body largo suficiente' });
  const moved = helpdeskService.moveTicket(ticket.id, { status: 'in_progress' }, { id: 'admin' });
  assert.equal(moved.success, true);
  assert.equal(moved.ticket.status, 'in_progress');
});

test('moveTicket rechaza estado inválido', () => {
  const { ticket } = helpdeskService.createTicket({ tenant_id: TENANT, requester_email: 'g@h.com', requester_name: 'G', subject: 'T4', body: 'body largo suficiente' });
  const r = helpdeskService.moveTicket(ticket.id, { status: 'invalido' }, { id: 'admin' });
  assert.equal(r.success, false);
});
