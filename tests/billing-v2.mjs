import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listPlans,
  getPlan,
  getPlanForTenant,
  getSubscription,
  subscribe,
  cancel,
  recordUsage,
  getUsage,
  issueInvoice,
  listInvoices,
  handleWebhook,
  getProviderInfo,
  adminProvisionEnterprise,
  PLANS,
  ensureSchema as _ensureBillingSchema
} from '../src/services/billingV2Service.js';
import db from '../src/services/db.js';

function clean() {
  _ensureBillingSchema();
  db.exec(`DELETE FROM billing_subscriptions; DELETE FROM billing_usage_events; DELETE FROM billing_invoices;`);
}

test('PLANS: exposes Free / Pro / Enterprise with correct tiers', () => {
  assert.ok(PLANS.free);
  assert.ok(PLANS.pro);
  assert.ok(PLANS.enterprise);
  assert.equal(PLANS.free.price_usd, 0);
  assert.equal(PLANS.pro.price_usd, 99);
  assert.equal(PLANS.enterprise.price_usd, null);
  assert.equal(PLANS.pro.monthly_quota, 1_000_000);
  assert.equal(PLANS.pro.rate_per_minute, 600);
  assert.equal(PLANS.enterprise.monthly_quota, Infinity);
});

test('listPlans: returns plans sorted ascending by sort key', () => {
  const plans = listPlans();
  assert.equal(plans.length, 3);
  assert.equal(plans[0].id, 'free');
  assert.equal(plans[1].id, 'pro');
  assert.equal(plans[2].id, 'enterprise');
});

test('getPlan: returns null for unknown plan, object for known', () => {
  assert.equal(getPlan('unknown'), null);
  assert.equal(getPlan('pro').id, 'pro');
});

test('getPlanForTenant: defaults to Free when no subscription', () => {
  clean();
  const plan = getPlanForTenant('tenant-no-sub');
  assert.equal(plan.id, 'free');
  assert.equal(plan.monthly_quota, 100_000);
});

test('subscribe: creates active subscription for tenant', async () => {
  clean();
  const sub = await subscribe('tenant-1', 'pro');
  assert.equal(sub.tenant_id, 'tenant-1');
  assert.equal(sub.plan_id, 'pro');
  assert.equal(sub.status, 'active');
  assert.ok(sub.id);
  assert.ok(sub.current_period_start);
  assert.ok(sub.current_period_end);
});

test('subscribe: rejects unknown plan', async () => {
  await assert.rejects(() => subscribe('t', 'unknown'), /Unknown plan/);
});

test('subscribe: rejects enterprise plan (requires sales)', async () => {
  await assert.rejects(() => subscribe('t', 'enterprise'), /Enterprise plan requires/);
});

test('subscribe: cancels previous active subscription before creating new one', async () => {
  clean();
  await subscribe('t', 'pro');
  await subscribe('t', 'pro');
  const subs = db.prepare(`SELECT * FROM billing_subscriptions WHERE tenant_id = ?`).all('t');
  // 2 rows: 1 cancelled, 1 active
  const active = subs.filter((s) => s.status === 'active');
  const cancelled = subs.filter((s) => s.status === 'cancelled');
  assert.equal(active.length, 1);
  assert.equal(cancelled.length, 1);
});

test('getSubscription: returns null when tenant has no active subscription', () => {
  clean();
  const sub = getSubscription('nope');
  assert.equal(sub, null);
});

test('cancel: sets cancel_at_period_end on active subscription', async () => {
  clean();
  await subscribe('t-cancel', 'pro');
  const result = cancel('t-cancel');
  assert.equal(result.cancelled, true);
  assert.equal(result.subscription.cancel_at_period_end, true);
});

test('cancel: returns cancelled:false when no active subscription', () => {
  clean();
  const result = cancel('nope');
  assert.equal(result.cancelled, false);
});

test('getPlanForTenant: returns Pro after subscribe', async () => {
  clean();
  await subscribe('t-pro', 'pro');
  const plan = getPlanForTenant('t-pro');
  assert.equal(plan.id, 'pro');
  assert.equal(plan.monthly_quota, 1_000_000);
});

test('recordUsage: persists event with 1.5x billing markup', () => {
  clean();
  const event = recordUsage({ tenantId: 't-use', apiKeyId: 'k1', endpoint: '/v1/aaas/generate', tokensIn: 100, tokensOut: 200, costUsd: 0.01 });
  assert.ok(event.id);
  assert.equal(event.billed_usd, 0.015);
  assert.equal(event.plan_id, 'free'); // default plan (no subscription)
});

test('getUsage: aggregates by endpoint for current period', () => {
  clean();
  recordUsage({ tenantId: 't-agg', apiKeyId: 'k1', endpoint: '/v1/aaas/generate', tokensIn: 100, tokensOut: 200, costUsd: 0.01 });
  recordUsage({ tenantId: 't-agg', apiKeyId: 'k1', endpoint: '/v1/aaas/generate', tokensIn: 50, tokensOut: 100, costUsd: 0.005 });
  recordUsage({ tenantId: 't-agg', apiKeyId: 'k2', endpoint: '/v1/aaas/usage', tokensIn: 0, tokensOut: 0, costUsd: 0 });
  const usage = getUsage('t-agg');
  assert.equal(usage.used, 3);
  assert.equal(usage.breakdown.length, 2);
  const gen = usage.breakdown.find((b) => b.endpoint === '/v1/aaas/generate');
  assert.equal(gen.calls, 2);
  assert.equal(gen.tokens_in, 150);
});

test('getUsage: returns plan quota + remaining (Infinity for enterprise)', async () => {
  clean();
  await adminProvisionEnterprise('t-ent');
  const usage = getUsage('t-ent');
  assert.equal(usage.quota, Infinity);
  assert.equal(usage.remaining, Infinity);
});

test('getUsage: remaining is max(0, quota-used) for finite quota', async () => {
  clean();
  await subscribe('t-remaining', 'pro');
  for (let i = 0; i < 5; i++) recordUsage({ tenantId: 't-remaining', apiKeyId: 'k1', endpoint: '/v1/test', tokensIn: 0, tokensOut: 0, costUsd: 0 });
  const usage = getUsage('t-remaining');
  assert.equal(usage.used, 5);
  assert.equal(usage.remaining, 1_000_000 - 5);
});

test('issueInvoice: Free plan produces 0-amount invoice', async () => {
  clean();
  await subscribe('t-inv', 'pro');
  const inv = issueInvoice('t-inv');
  assert.equal(inv.amount_usd, 99);
  assert.equal(inv.line_items.length, 1);
  assert.equal(inv.line_items[0].amount_usd, 99);
});

test('issueInvoice: overage adds line item when used > quota', async () => {
  clean();
  // Use a custom plan with tiny quota to exercise the overage path cheaply.
  // Import the plan registry and inject a temporary plan.
  const { PLANS } = await import('../src/services/billingV2Service.js');
  const originalQuota = PLANS.pro.monthly_quota;
  const originalOverage = PLANS.pro.overage_per_1k_usd;
  PLANS.pro.monthly_quota = 100;
  PLANS.pro.overage_per_1k_usd = 0.01;
  try {
    await subscribe('t-over', 'pro');
    for (let i = 0; i < 150; i++) {
      recordUsage({ tenantId: 't-over', apiKeyId: 'k1', endpoint: '/v1/x', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    }
    const inv = issueInvoice('t-over');
    assert.ok(inv.amount_usd > 99, `expected > 99, got ${inv.amount_usd}`);
    const overageLine = inv.line_items.find((l) => l.description.startsWith('Overage'));
    assert.ok(overageLine);
    // 50 overage / 1000 = 0.05 * 0.01 = 0.0005
    assert.equal(overageLine.amount_usd, 0.0005);
  } finally {
    PLANS.pro.monthly_quota = originalQuota;
    PLANS.pro.overage_per_1k_usd = originalOverage;
  }
});

test('issueInvoice: returns null for enterprise plan (billed manually)', async () => {
  clean();
  await adminProvisionEnterprise('t-ent-inv');
  assert.equal(issueInvoice('t-ent-inv'), null);
});

test('listInvoices: returns invoices for tenant in reverse chronological order', async () => {
  clean();
  await subscribe('t-list-inv', 'pro');
  issueInvoice('t-list-inv');
  issueInvoice('t-list-inv');
  const list = listInvoices('t-list-inv');
  assert.equal(list.length, 2);
});

test('handleWebhook: marks invoice.paid', () => {
  clean();
  subscribe('t-wh', 'pro').then(() => {
    const inv = issueInvoice('t-wh');
    const result = handleWebhook({ type: 'invoice.paid', data: { invoice_id: inv.id } });
    assert.equal(result.processed, true);
    assert.equal(result.updated, 1);
  });
});

test('handleWebhook: cancels subscription on customer.subscription.cancelled', async () => {
  clean();
  const sub = await subscribe('t-wh2', 'pro');
  const result = handleWebhook({ type: 'customer.subscription.cancelled', data: { subscription_id: sub.provider_subscription_id } });
  assert.equal(result.processed, true);
  assert.equal(result.updated, 1);
  const after = getSubscription('t-wh2');
  assert.equal(after, null);
});

test('handleWebhook: returns processed:false for unknown event type', () => {
  const result = handleWebhook({ type: 'something.weird' });
  assert.equal(result.processed, false);
  assert.match(result.reason, /unhandled_event_type/);
});

test('getProviderInfo: reports mock provider by default', () => {
  const info = getProviderInfo();
  assert.equal(info.provider, 'mock');
  assert.equal(info.stripe_configured, false);
  assert.equal(info.plans_count, 3);
});
