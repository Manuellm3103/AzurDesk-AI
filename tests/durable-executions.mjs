import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import durableExecutionService from '../src/services/durableExecutionService.js';

const TENANT = 'tenant-durable-test';

describe('durableExecutionService', () => {
  it('start crea ejecución con estado pending y un evento started', () => {
    const ex = durableExecutionService.start(TENANT, { name: 'test-flow', context: { order: 'A1' }, max_attempts: 2 });
    assert.equal(ex.tenant_id, TENANT);
    assert.equal(ex.name, 'test-flow');
    assert.equal(ex.status, 'pending');
    assert.equal(ex.max_attempts, 2);
    assert.equal(ex.events.length, 1);
    assert.equal(ex.events[0].type, 'started');
    assert.equal(ex.context.order, 'A1');
  });

  it('recordEvent marca running y luego failed con intento', () => {
    const ex = durableExecutionService.start(TENANT, { name: 'retry-flow' });
    durableExecutionService.recordEvent(TENANT, ex.id, { type: 'attempt', payload: { step: 1 } });
    let current = durableExecutionService.get(TENANT, ex.id);
    assert.equal(current.status, 'running'); // sin error/result es running
    assert.equal(current.attempts, 1);
    // error: failed y vuelve a pending para reintento porque attempts < max_attempts (3)
    durableExecutionService.recordEvent(TENANT, ex.id, { type: 'attempt', payload: { step: 1 }, error: { message: 'timeout' } });
    current = durableExecutionService.get(TENANT, ex.id);
    assert.equal(current.status, 'pending');
    assert.equal(current.attempts, 2);
    // intento exitoso
    durableExecutionService.recordEvent(TENANT, ex.id, { type: 'attempt', payload: { step: 1 }, result: { ok: true } });
    current = durableExecutionService.get(TENANT, ex.id);
    assert.equal(current.status, 'running');
  });

  it('complete cierra ejecución con resultado', () => {
    const ex = durableExecutionService.start(TENANT, { name: 'complete-flow' });
    durableExecutionService.complete(TENANT, ex.id, { status: 'paid', tx: 'tx-123' });
    const current = durableExecutionService.get(TENANT, ex.id);
    assert.equal(current.status, 'completed');
    assert.equal(current.result.status, 'paid');
    assert.equal(current.events[current.events.length - 1].type, 'completed');
  });

  it('runActivity es idempotente: replay devuelve resultado previo sin reejecutar', async () => {
    const ex = durableExecutionService.start(TENANT, { name: 'idempotent' });
    const calls = { n: 0 };
    const fn = async () => { calls.n++; return { charged: true }; };
    const r1 = await durableExecutionService.runActivity(TENANT, ex.id, { seq: 1, type: 'charge', fn });
    assert.equal(r1.replay, false);
    assert.equal(r1.result.charged, true);
    // ahora el evento guardado tiene result, el replay debe devolver true
    const r2 = await durableExecutionService.runActivity(TENANT, ex.id, { seq: 1, type: 'charge', fn });
    assert.equal(r2.replay, true);
    assert.equal(r2.result.charged, true);
    assert.equal(calls.n, 1);
  });

  it('events lista eventos en orden', () => {
    const ex = durableExecutionService.start(TENANT, { name: 'event-order' });
    durableExecutionService.recordEvent(TENANT, ex.id, { type: 'a', payload: { n: 1 } });
    durableExecutionService.recordEvent(TENANT, ex.id, { type: 'b', payload: { n: 2 } });
    const evs = durableExecutionService.events(TENANT, ex.id);
    assert.ok(evs.length >= 3);
    assert.equal(evs[0].type, 'started');
    assert.equal(evs[1].type, 'a');
    assert.equal(evs[2].type, 'b');
  });

  it('list filtra por estado', () => {
    const ex1 = durableExecutionService.start(TENANT, { name: 'pending-one' });
    const ex2 = durableExecutionService.start(TENANT, { name: 'completed-one' });
    durableExecutionService.complete(TENANT, ex2.id, { ok: true });
    const pending = durableExecutionService.list(TENANT, { status: 'pending' });
    const completed = durableExecutionService.list(TENANT, { status: 'completed' });
    assert.ok(pending.some(e => e.id === ex1.id));
    assert.ok(completed.some(e => e.id === ex2.id));
  });

  it('delete elimina ejecución y eventos', () => {
    const ex = durableExecutionService.start(TENANT, { name: 'delete-me' });
    assert.ok(durableExecutionService.delete(TENANT, ex.id));
    assert.equal(durableExecutionService.get(TENANT, ex.id), null);
    assert.equal(durableExecutionService.events(TENANT, ex.id), null);
  });
});
