import test from 'node:test';
import assert from 'node:assert/strict';
import evalService from '../src/services/agentEvalService.js';
import aaasGateway from '../src/services/aaasGatewayService.js';

test('eval pass for ticket.create golden case', async () => {
  const tenant = 't-eval-' + Date.now();
  aaasGateway.bootstrapTenant(tenant);
  const c = evalService.addCase({
    tenant_id: tenant,
    intent: 'ticket.create',
    payload: { requester_email: 'a@b.com', requester_name: 'A', subject: 'Eval', body: 'x' },
    expected_keys: ['id', 'subject'],
    expected_value: 'Eval'
  });
  const r = await evalService.runEval(tenant, c.id);
  assert.equal(r.success, true);
  assert.equal(r.passed, true, JSON.stringify(r));
});

test('eval fail when expected key missing', async () => {
  const tenant = 't-eval2-' + Date.now();
  const c = evalService.addCase({
    tenant_id: tenant,
    intent: 'memory.remember',
    payload: { user_id: 'u1', content: 'hola' },
    expected_keys: ['nonexistent_key_xyz']
  });
  const r = await evalService.runEval(tenant, c.id);
  assert.equal(r.passed, false);
});
