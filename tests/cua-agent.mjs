import test from 'node:test';
import assert from 'node:assert/strict';
import * as cuaAgentService from '../src/services/cuaAgentService.js';

test('agentAct devuelve estructura de pasos', async () => {
  const r = await cuaAgentService.agentAct({ tenant_id: 't1', agent_id: 'a1', task: 'abrir notepad', max_steps: 2 });
  assert.equal(r.tenant_id, 't1');
  assert.equal(r.agent_id, 'a1');
  assert.ok(Array.isArray(r.steps));
});
