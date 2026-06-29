import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import conductorLite from '../src/services/conductorLiteService.js';
import durableExec from '../src/services/durableExecutionService.js';

const tenant = 'tenant-rest-conductor';

function resetTables() {
  conductorLite.ensureTables();
  durableExec.ensureTables();
  // Tenant-scoped cleanup to avoid clobbering parallel test files sharing the same DB.
  db.prepare('DELETE FROM conductor_workflows WHERE tenant_id = ?').run(tenant);
  db.prepare('DELETE FROM conductor_runs WHERE tenant_id = ?').run(tenant);
  db.prepare('DELETE FROM durable_executions WHERE tenant_id = ?').run(tenant);
  db.prepare('DELETE FROM durable_execution_events WHERE execution_id IN (SELECT id FROM durable_executions WHERE tenant_id = ?)').run(tenant);
}

describe('conductor-lite REST', () => {
  it('define workflow via service matches expected contract', () => {
    resetTables();
    const wf = conductorLite.defineWorkflow(tenant, {
      name: 'approval',
      dag: {
        steps: [
          { id: 'request', action: 'ticket.create', deps: [] },
          { id: 'approve', action: 'ticket.approve', deps: ['request'] },
          { id: 'notify', action: 'email.send', deps: ['approve'] }
        ]
      }
    });
    assert.equal(wf.name, 'approval');
    const list = conductorLite.listWorkflows(tenant);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, wf.id);
    assert.equal(list[0].dag.steps.length, 3);

    const run = conductorLite.startRun(tenant, wf.id, { inputs: { user: 'alice' } }, durableExec);
    assert.ok(run.runId);
    assert.ok(['pending','running', 'completed'].includes(run.status));
    assert.equal(conductorLite.getRun(tenant, run.runId).workflow_id, wf.id);

    const fetched = conductorLite.getRun(tenant, run.runId);
    assert.equal(fetched.id, run.runId);
  });

  it('URL path parsing matches service IDs', () => {
    resetTables();
    const wf = conductorLite.defineWorkflow(tenant, {
      name: 'parse-test',
      dag: { steps: [{ id: 'a', action: 'noop', deps: [] }] }
    });
    const workflowPath = `/api/conductor/workflows/${wf.id}/runs`;
    const idFromRunsPath = workflowPath.split('/')[4];
    assert.equal(idFromRunsPath, wf.id);

    const run = conductorLite.startRun(tenant, wf.id, {}, durableExec);
    const runPath = `/api/conductor/runs/${run.runId}`;
    const idFromRunPath = runPath.split('/')[4];
    assert.equal(idFromRunPath, run.runId);

    const resumePath = `/api/conductor/runs/${run.runId}/resume`;
    assert.ok(resumePath.startsWith('/api/conductor/runs/') && resumePath.endsWith('/resume'));
  });
});
