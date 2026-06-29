import test from 'node:test';
import assert from 'node:assert/strict';
import dag from '../src/services/agentDAGService.js';
import gateway from '../src/services/aaasGatewayService.js';

test('run simple DAG of chained agent intents', async () => {
  gateway.bootstrapTenant('t-dag');
  const plan = [
    { id: '1', intent: 'ticket.create', payload: { requester_email: 'a@b.com', requester_name: 'A', subject: 'DAG', body: 'x' }, deps: [] },
    { id: '2', intent: 'memory.remember', payload: { user_id: 'u-dag', content: 'ticket created' }, deps: ['1'] }
  ];
  const r = await dag.run({ tenant_id: 't-dag', intent: 'dag.demo', payload: {}, plan });
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(r.runs.length, 2);
  assert.ok(r.outputs['1'].id || r.outputs['1'].ticket_id || r.outputs['1'].success);
});

test('DAG with missing deps returns error', async () => {
  const r = await dag.run({ tenant_id: 't-dag', intent: 'x', payload: {}, plan: [] });
  assert.equal(r.success, false);
});
