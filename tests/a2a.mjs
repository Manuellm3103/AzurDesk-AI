import test from 'node:test';
import assert from 'node:assert/strict';
import a2a from '../src/services/a2aService.js';

const SECRET = 'a2a-secret-test';

test('A2A send and receive signed card', () => {
  const card = a2a.sendCard('t-a', { from_agent: 'alice', to_tenant: 't-b', to_agent: 'bob', task_type: 'delegate', payload: { x: 1 }, secret: SECRET });
  assert.ok(card.id);
  const received = a2a.receiveCards('t-b', 'bob', SECRET);
  assert.ok(received.length >= 1);
  assert.equal(received[0].task_type, 'delegate');
});

test('A2A rejects invalid signature', () => {
  const card = a2a.sendCard('t-a', { from_agent: 'alice', to_tenant: 't-c', to_agent: 'charlie', task_type: 'delegate', payload: {}, secret: SECRET });
  const received = a2a.receiveCards('t-c', 'charlie', 'wrong-secret');
  assert.equal(received.length, 0);
});

test('A2A update status', () => {
  const card = a2a.sendCard('t-a', { from_agent: 'alice', to_tenant: 't-d', to_agent: 'dave', task_type: 'delegate', payload: {}, secret: SECRET });
  const r = a2a.updateStatus(card.id, 't-d', 'accepted', { ok: true });
  assert.equal(r.status, 'accepted');
});
