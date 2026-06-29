import test from 'node:test';
import assert from 'node:assert/strict';
import remediation from '../src/services/remediationService.js';

const tenant = 'remediation-test-' + Date.now();

const rule = remediation.createRule(tenant, {
  name: 'Escalate high CPU',
  trigger: 'cpu.spike',
  condition: { severity: 'critical' },
  actions: [{ type: 'notify', args: { channel: 'slack' } }, { type: 'noop', args: {} }]
});

assert.ok(rule.id, 'rule created');

const list = remediation.listRules(tenant);
assert.equal(list.length, 1, 'list rules');

const run = await remediation.runRule(tenant, rule.id, 'alert-1', { severity: 'critical' });
assert.equal(run.status, 'completed', 'remediation completed');
assert.ok(run.outputs.length >= 2, 'actions executed');

const runs = remediation.listRuns(tenant);
assert.equal(runs.length, 1, 'run logged');

const upd = remediation.updateRule(rule.id, tenant, { enabled: false });
assert.equal(upd.enabled, false, 'disable rule');

const del = remediation.deleteRule(rule.id, tenant);
assert.equal(del, true, 'delete rule');

console.log('REMEDIATION DSL: all tests passed');
