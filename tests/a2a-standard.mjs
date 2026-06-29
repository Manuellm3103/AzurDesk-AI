import test from 'node:test';
import assert from 'node:assert/strict';
import a2a from '../src/services/a2aStandardService.js';

test('submit and complete standard A2A task', () => {
  const task = a2a.submitTask({ tenant_id: 't-a2a', sender: 'agent-a', receiver: 'agent-b', payload: { intent: 'ticket.create' } });
  assert.equal(task.status, 'submitted');
  assert.equal(task.sender, 'agent-a');
  const updated = a2a.updateTask(task.id, 'completed', { message: { role: 'agent', text: 'Done' }, artifact: { ticket_id: 'TK-123' } });
  assert.equal(updated.status, 'completed');
  assert.equal(updated.artifacts.length, 1);
  assert.equal(updated.messages.length, 1);
});

test('list tasks by tenant', () => {
  const tasks = a2a.listTasks('t-a2a');
  assert.ok(Array.isArray(tasks));
  assert.ok(tasks.length >= 1);
});

test('cancel task', () => {
  const task = a2a.submitTask({ tenant_id: 't-a2a2', sender: 'x', receiver: 'y', payload: {} });
  const canceled = a2a.cancelTask(task.id);
  assert.equal(canceled.status, 'canceled');
});
