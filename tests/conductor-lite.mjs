import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import conductorLite from '../src/services/conductorLiteService.js';
import durableExec from '../src/services/durableExecutionService.js';
import { randomUUID } from 'crypto';

const tenant = 'tenant_' + randomUUID();

function resetTables() {
  conductorLite.ensureTables();
  durableExec.ensureTables();
  // Tenant-scoped cleanup to avoid clobbering parallel test files sharing the same DB.
  db.prepare('DELETE FROM conductor_workflows WHERE tenant_id = ?').run(tenant);
  db.prepare('DELETE FROM conductor_runs WHERE tenant_id = ?').run(tenant);
  db.prepare('DELETE FROM durable_executions WHERE tenant_id = ?').run(tenant);
  db.prepare('DELETE FROM durable_execution_events WHERE execution_id IN (SELECT id FROM durable_executions WHERE tenant_id = ?)').run(tenant);
}

describe('conductor-lite', () => {
  it('define workflow and list', () => {
    resetTables();
    const wf = conductorLite.defineWorkflow(tenant, {
      name: 'simple',
      dag: { steps: [{ id: 'a', type: 'task' }, { id: 'b', type: 'task', deps: ['a'] }] }
    });
    assert.equal(wf.name, 'simple');
    const list = conductorLite.listWorkflows(tenant);
    assert.equal(list.length, 1);
  });

  it('runs a linear DAG with replay idempotency', async () => {
    resetTables();
    const wf = conductorLite.defineWorkflow(tenant, {
      name: 'linear',
      dag: {
        steps: [
          { id: 'ingest', type: 'task' },
          { id: 'enrich', type: 'task', deps: ['ingest'] },
          { id: 'notify', type: 'task', deps: ['enrich'] }
        ]
      }
    });
    const calls = [];
    const handlers = {
      ingest: () => { calls.push('ingest'); return { ok: 1 }; },
      enrich: (input) => { calls.push('enrich'); return { input }; },
      notify: (input) => { calls.push('notify'); return { sent: true }; }
    };
    const { runId } = conductorLite.startRun(tenant, wf.id, { lead: 'x' }, durableExec);
    const first = await conductorLite.resumeRun(tenant, runId, { durableExec, stepHandlers: handlers });
    assert.equal(first.status, 'completed');

    // Re-advance must replay from events without re-executing handlers.
    const second = await conductorLite.resumeRun(tenant, runId, { durableExec, stepHandlers: handlers });
    assert.equal(second.status, 'completed');
    assert.equal(calls.length, 3, 'handlers should only execute once per step');
  });

  it('runs a diamond DAG in correct order', async () => {
    resetTables();
    const wf = conductorLite.defineWorkflow(tenant, {
      name: 'diamond',
      dag: {
        steps: [
          { id: 'split', type: 'task' },
          { id: 'left', type: 'task', deps: ['split'] },
          { id: 'right', type: 'task', deps: ['split'] },
          { id: 'join', type: 'task', deps: ['left', 'right'] }
        ]
      }
    });
    const order = [];
    const handlers = {
      split: () => { order.push('split'); return { split: 1 }; },
      left: () => { order.push('left'); return { left: 1 }; },
      right: () => { order.push('right'); return { right: 1 }; },
      join: (input) => { order.push('join'); return { input }; }
    };
    const { runId } = conductorLite.startRun(tenant, wf.id, {}, durableExec);
    const result = await conductorLite.resumeRun(tenant, runId, { durableExec, stepHandlers: handlers });
    assert.equal(result.status, 'completed');
    assert.equal(order[0], 'split');
    assert.ok(order.indexOf('join') > order.indexOf('left'));
    assert.ok(order.indexOf('join') > order.indexOf('right'));
  });

  it('survives a mid-run failure and resumes from checkpoint', async () => {
    resetTables();
    const wf = conductorLite.defineWorkflow(tenant, {
      name: 'retry',
      dag: { steps: [{ id: 'ok', type: 'task' }, { id: 'failOnce', type: 'task', deps: ['ok'] }] }
    });
    let failCount = 0;
    const handlers = {
      ok: () => ({ ok: 1 }),
      failOnce: () => {
        failCount++;
        if (failCount === 1) throw new Error('transient');
        return { recovered: true };
      }
    };
    const { runId, executionId } = conductorLite.startRun(tenant, wf.id, {}, durableExec);
    // First advance: 'ok' completes, 'failOnce' records failed event.
    const bad = await conductorLite.resumeRun(tenant, runId, { durableExec, stepHandlers: handlers });
    assert.equal(bad.status, 'failed');

    // Repair durable execution to pending to simulate retry.
    db.prepare('UPDATE durable_executions SET status=?, attempts=? WHERE id=?').run('pending', 0, executionId);

    // Second advance should replay ok and re-run failOnce.
    const good = await conductorLite.resumeRun(tenant, runId, { durableExec, stepHandlers: handlers });
    assert.equal(good.status, 'completed');
    assert.equal(failCount, 2);
  });
});
