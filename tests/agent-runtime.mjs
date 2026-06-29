import test from 'node:test';
import assert from 'node:assert/strict';
import agentRuntime from '../src/services/agentRuntimeService.js';

test('register and dispatch agent by intent', () => {
  const a = agentRuntime.register('t-rt', { name: 'Helpdesk Agent', description: 'Resolves tickets', capabilities: ['ticket.create', 'ticket.list'] });
  assert.ok(a.id);
  const dispatched = agentRuntime.dispatch('t-rt', { intent: 'ticket.create', payload: { subject: 'X' } });
  assert.equal(dispatched.success, true);
  assert.ok(dispatched.run.run_id);
});

test('no agent for intent returns error', () => {
  const r = agentRuntime.dispatch('t-rt-none', { intent: 'unknown.intent', payload: {} });
  assert.equal(r.success, false);
  assert.ok(r.error.includes('No agent'));
});

test('agent run lifecycle', () => {
  const a = agentRuntime.register('t-rt2', { name: 'Workflow Agent', capabilities: ['workflow.run'] });
  const run = agentRuntime.startRun('t-rt2', a.id, { foo: 'bar' });
  assert.equal(run.status, 'running');
  agentRuntime.endRun(run.run_id, { output: { ok: true }, status: 'completed' });
  const runs = agentRuntime.getRuns(a.id);
  assert.equal(runs[0].status, 'completed');
});
