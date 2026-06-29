import test from 'node:test';
import assert from 'node:assert/strict';
import cost from '../src/services/agentCostService.js';

const tenant = 'cost-test-' + Date.now();

const c1 = cost.recordCharge(tenant, { resource: 'agent.invoke', resource_id: 'i1', agent_id: 'a1', session_id: 's1', metric: 'agent.invocation', quantity: 10 });
assert.equal(c1.cost, 0.1, 'agent invocation cost');

const c2 = cost.recordCharge(tenant, { resource: 'llm.call', resource_id: 'i2', agent_id: 'a1', metric: 'llm.token.input', quantity: 1000 });
assert.ok(c2.cost > 0, 'llm input cost');

const charges = cost.getCharges(tenant, { agent_id: 'a1' });
assert.equal(charges.length, 2, 'charges by agent');

const summary = cost.summarizeByAgent(tenant);
assert.equal(summary.length, 1, 'agent summary');
assert.ok(summary[0].total_cost >= 0.1, 'total cost');

const totals = cost.getTotals(tenant);
assert.ok(totals.total_cost > 0, 'totals positive');

const estimate = cost.estimateLLM(tenant, { input_tokens: 2000, output_tokens: 500, model: 'qwen' });
assert.ok(estimate.estimated_cost_usd > 0, 'llm estimate positive');

console.log('AGENT COST: all tests passed');
