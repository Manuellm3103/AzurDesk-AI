import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../src/services/aaasGatewayService.js';

test('bootstrap tenant creates agents', () => {
  const agents = gateway.bootstrapTenant('t-gw');
  assert.ok(agents.length >= 10);
  const helpdesk = agents.find(a => a.name === 'Helpdesk Agent');
  assert.ok(helpdesk.capabilities.includes('ticket.create'));
});

test('invoke ticket.create through AaaS gateway', async () => {
  gateway.bootstrapTenant('t-gw2');
  const r = await gateway.invoke('t-gw2', { intent: 'ticket.create', payload: { requester_email: 'a@b.com', requester_name: 'A', subject: 'Gateway Test', body: 'From gateway', tenant_id: 't-gw2' } });
  assert.equal(r.success, true, r.error);
  assert.ok(r.output.id || r.output.ticket_id);
});

test('invoke memory.remember and recall through gateway', async () => {
  gateway.bootstrapTenant('t-gw3');
  await gateway.invoke('t-gw3', { intent: 'memory.remember', payload: { user_id: 'u-gw', content: 'gateway test', kind: 'semantic' } });
  const r = await gateway.invoke('t-gw3', { intent: 'memory.recall', payload: { user_id: 'u-gw', query: 'gateway', limit: 5 } });
  assert.equal(r.success, true);
  assert.ok(r.output.memories.length >= 1);
});

test('unknown intent returns error', async () => {
  const r = await gateway.invoke('t-gw4', { intent: 'nothing.here', payload: {} });
  assert.equal(r.success, false);
});
