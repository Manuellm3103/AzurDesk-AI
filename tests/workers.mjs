import test from 'node:test';
import assert from 'node:assert/strict';
import eventQueue from '../src/services/eventQueueService.js';
import worker from '../src/services/workerService.js';

test('event queue enqueue/pop/complete', () => {
  const j = eventQueue.enqueue('test-q', { x: 1 });
  assert.equal(j.status, 'pending');
  const popped = eventQueue.pop('test-q');
  assert.ok(popped);
  assert.equal(popped.payload.x, 1);
  eventQueue.complete(popped.id, { done: true });
  const listed = eventQueue.list('test-q');
  assert.equal(listed[0].status, 'completed');
});

test('worker processes registered queue', (t, done) => {
  let processed = false;
  worker.register('worker-test', (payload) => { processed = true; return { ok: true }; });
  worker.start();
  eventQueue.enqueue('worker-test', { y: 2 });
  setTimeout(() => {
    worker.stop();
    assert.ok(processed, 'worker should have processed job');
    done();
  }, 3500);
});
