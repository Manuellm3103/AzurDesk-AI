import test from 'node:test';
import assert from 'node:assert/strict';
import wf from '../src/services/agentWorkforceService.js';

test('schedule task assigns to agent with matching skills', async () => {
  const tenant = 't-wf-' + Date.now();
  const { default: db } = await import('../src/services/db.js');
  db.prepare(`INSERT INTO agents (id, tenant_id, name, role, level, skills, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('agent-wf-1-' + Date.now(), tenant, 'Network Bot', 'specialist', 2, 'network,security', 'idle', new Date().toISOString());
  const r = wf.scheduleTask({ tenant_id: tenant, task_type: 'diagnose', priority: 2, required_skills: ['network'], payload: { ip: '10.0.0.1' } });
  assert.equal(r.success, true);
  assert.equal(r.agent_name, 'Network Bot');
  const assignments = wf.listAssignments(tenant);
  assert.equal(assignments.length, 1);
});

test('complete assignment frees agent', async () => {
  const tenant = 't-wf2-' + Date.now();
  const { default: db } = await import('../src/services/db.js');
  db.prepare(`INSERT INTO agents (id, tenant_id, name, role, level, skills, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('agent-wf-2-' + Date.now(), tenant, 'General Bot', 'general', 1, '', 'idle', new Date().toISOString());
  const r = wf.scheduleTask({ tenant_id: tenant, task_type: 'simple', payload: {} });
  const completed = wf.completeAssignment(r.assignment_id, { ok: true });
  assert.equal(completed.assignment.status, 'completed');
});
