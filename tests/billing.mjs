import test from 'node:test';
import assert from 'node:assert/strict';
import billing from '../src/services/billingService.js';

test('record and aggregate usage', () => {
  const tenant = 't-bill-' + Date.now();
  billing.recordUsage({ tenant_id: tenant, resource: 'agent.invoke', metric: 'count', quantity: 3 });
  billing.recordUsage({ tenant_id: tenant, resource: 'agent.invoke', metric: 'count', quantity: 2 });
  const usage = billing.getUsage(tenant);
  const item = usage.items.find(i => i.resource === 'agent.invoke');
  assert.equal(item.total, 5);
});

test('generate invoice with rates', () => {
  const tenant = 't-bill-inv-' + Date.now();
  billing.recordUsage({ tenant_id: tenant, resource: 'agent.invoke', metric: 'count', quantity: 10 });
  const inv = billing.getInvoice(tenant);
  const line = inv.lines.find(l => l.resource === 'agent.invoke');
  assert.ok(line.cost > 0);
  assert.ok(inv.currency === 'USD');
});
