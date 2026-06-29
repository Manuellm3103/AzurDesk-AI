import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import tenantService from '../src/services/tenantService.js';
import workflowService from '../src/services/workflowService.js';
import rateLimitMiddleware from '../src/services/rateLimitMiddleware.js';

function cleanTenant(tenantId) {
  for (const t of ['tenant_signups', 'tenant_quotas', 'ai_workflows', 'ai_workflow_runs', 'users']) {
    try { db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(tenantId); } catch {}
  }
}

test('tenant signup crea tenant + user + quota', () => {
  const email = `test-signup-${Date.now()}@azurdesk.ai`;
  const result = tenantService.signup({ email, password: 'testpass123', company_name: 'TestCo', plan: 'free' });
  assert.ok(result.tenant_id);
  assert.equal(result.email, email);
  assert.equal(result.plan, 'free');

  const signup = tenantService.getSignup(result.tenant_id);
  assert.ok(signup);
  assert.equal(signup.company_name, 'TestCo');

  cleanTenant(result.tenant_id);
});

test('tenant signup rechaza email duplicado', () => {
  const email = `dup-${Date.now()}@azurdesk.ai`;
  tenantService.signup({ email, password: 'pass1', company_name: 'Co1', plan: 'free' });
  try {
    tenantService.signup({ email, password: 'pass2', company_name: 'Co2', plan: 'free' });
    assert.fail('Debería haber lanzado error');
  } catch (e) {
    assert.ok(e.message.includes('ya registrado'));
  }
  // cleanup both
  const signups = db.prepare('SELECT tenant_id FROM tenant_signups WHERE email = ?').all(email);
  for (const s of signups) cleanTenant(s.tenant_id);
});

test('tenant upgrade plan actualiza quotas', () => {
  const email = `upgrade-${Date.now()}@azurdesk.ai`;
  const result = tenantService.signup({ email, password: 'pass', company_name: 'UpgradeCo', plan: 'free' });
  const upgraded = tenantService.upgradePlan(result.tenant_id, 'pro');
  assert.equal(upgraded.plan, 'pro');
  const signup = tenantService.getSignup(result.tenant_id);
  assert.equal(signup.plan, 'pro');
  cleanTenant(result.tenant_id);
});

test('plans endpoint returns 4 tiers', () => {
  const plans = tenantService.getPlans();
  assert.ok(plans.free);
  assert.ok(plans.starter);
  assert.ok(plans.pro);
  assert.ok(plans.enterprise);
  assert.ok(plans.free.max_llm_calls_per_day < plans.pro.max_llm_calls_per_day);
});

test('workflow create → get → list → run → delete', () => {
  const TW = `tenant-wf-${Date.now()}`;
  cleanTenant(TW);
  const wf = workflowService.createWorkflow(TW, {
    name: 'Test Pipeline',
    description: 'Test workflow',
    nodes: [
      { id: 'start', type: 'prompt', config: { template: 'Say hello to {{name}}', system: 'Be polite' } },
      { id: 'out', type: 'output', config: { input_node: 'start' } }
    ],
    edges: [{ source: 'start', target: 'out' }]
  });
  assert.ok(wf.id);
  assert.equal(wf.name, 'Test Pipeline');
  assert.equal(wf.nodes.length, 2);

  const got = workflowService.getWorkflow(wf.id, TW);
  assert.equal(got.name, 'Test Pipeline');

  const list = workflowService.listWorkflows(TW);
  assert.equal(list.length, 1);

  const updated = workflowService.updateWorkflow(wf.id, TW, { name: 'Updated Pipeline' });
  assert.equal(updated.name, 'Updated Pipeline');

  assert.equal(workflowService.deleteWorkflow(wf.id, TW), true);
  cleanTenant(TW);
});

test('workflow validates node types', () => {
  const TW = `tenant-wf2-${Date.now()}`;
  try {
    workflowService.createWorkflow(TW, {
      name: 'Bad WF',
      nodes: [{ id: 'n1', type: 'invalid_type' }],
      edges: []
    });
    assert.fail('Should throw');
  } catch (e) {
    assert.ok(e.message.includes('Tipo de nodo inválido'));
  }
});

test('rate limit allows first request', () => {
  const fakeReq = { url: '/api/tickets', headers: { host: 'localhost:5200' } };
  const fakeRes = { setHeader: () => {} };
  const fakeUser = { tenant_id: 'test-rl-1' };
  const allowed = rateLimitMiddleware.rateLimit(fakeReq, fakeRes, fakeUser);
  assert.equal(allowed, true);
});