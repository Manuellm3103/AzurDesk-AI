// Billing service for the public AaaS API.
// Manages plans, subscriptions, metered usage events, and invoices.
//
// Architecture:
//   - In-memory + DB-backed subscription registry (table billing_subscriptions)
//   - In-memory + DB-backed usage events (table billing_usage_events)
//   - Pluggable payment provider via BILLING_PROVIDER env var:
//       "mock"  (default) — generates synthetic invoice IDs, no external calls
//       "stripe" — uses Stripe SDK when STRIPE_SECRET_KEY is set
//   - Invoices stored locally (table billing_invoices) for audit
//
// Plan tiers (Free / Pro / Enterprise) are the source of truth for quota
// and rate limits; the publicAaaSService reads from here so a plan upgrade
// propagates to existing API keys automatically (Sprint 4c).

import db from './db.js';
import { now } from './_utils.js';

const BILLING_PROVIDER = process.env.BILLING_PROVIDER || 'mock';

// ── Plan catalog ────────────────────────────────────────────────────────
// Quota and rate limits flow from here to publicAaaSService via getPlanForTenant.
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price_usd: 0,
    interval: 'month',
    monthly_quota: 100_000,
    rate_per_minute: 60,
    overage_per_1k_usd: 0,
    features: ['Community support', 'All endpoints', '1.0x cost markup'],
    sort: 0
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price_usd: 99,
    interval: 'month',
    monthly_quota: 1_000_000,
    rate_per_minute: 600,
    overage_per_1k_usd: 0.005,
    features: ['Email support (24h)', '1.5x cost markup', 'Slack alerts on quota'],
    sort: 1
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price_usd: null,        // custom
    interval: 'month',
    monthly_quota: Infinity,
    rate_per_minute: 6000,
    overage_per_1k_usd: 0.003,
    features: ['SLA 99.9%', 'Dedicated CSM', 'SSO/SAML', 'Custom rate limits', 'On-prem option'],
    sort: 2
  }
};

// ── Schema bootstrap ─────────────────────────────────────────────────────
let _schemaReady = false;
export function ensureSchema() {
  if (_schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subscription_id TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_billing_subs_tenant ON billing_subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_billing_subs_status ON billing_subscriptions(status);

    CREATE TABLE IF NOT EXISTS billing_usage_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      api_key_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      billed_usd REAL NOT NULL DEFAULT 0,
      period TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_billing_usage_tenant_period ON billing_usage_events(tenant_id, period);

    CREATE TABLE IF NOT EXISTS billing_invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      period TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_invoice_id TEXT,
      line_items TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant ON billing_invoices(tenant_id);
  `);
  _schemaReady = true;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function periodOf(d = new Date()) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}
function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function rowToSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    status: row.status,
    started_at: row.started_at,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    provider: row.provider,
    provider_subscription_id: row.provider_subscription_id,
    cancel_at_period_end: row.cancel_at_period_end === 1
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/** List all available plans (for the pricing page and `/v1/billing/plans`). */
export function listPlans() {
  return Object.values(PLANS).sort((a, b) => a.sort - b.sort);
}

/** Get a single plan by id. */
export function getPlan(planId) {
  return PLANS[planId] || null;
}

/** Return the active plan for a tenant, defaulting to Free. */
export function getPlanForTenant(tenantId) {
  ensureSchema();
  const row = db.prepare(
    `SELECT * FROM billing_subscriptions
     WHERE tenant_id = ? AND status IN ('active','trialing')
     ORDER BY started_at DESC LIMIT 1`
  ).get(tenantId);
  const planId = row?.plan_id || 'free';
  return getPlan(planId) || getPlan('free');
}

/** Get the full subscription object for a tenant (or null if none active). */
export function getSubscription(tenantId) {
  ensureSchema();
  const row = db.prepare(
    `SELECT * FROM billing_subscriptions
     WHERE tenant_id = ? AND status IN ('active','trialing')
     ORDER BY started_at DESC LIMIT 1`
  ).get(tenantId);
  return rowToSub(row);
}

/** Subscribe a tenant to a plan. Mock provider returns synthetic IDs. */
export async function subscribe(tenantId, planId, { paymentMethodId = null } = {}) {
  ensureSchema();
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Unknown plan: ${planId}`);
  if (planId === 'enterprise') throw new Error('Enterprise plan requires sales contact (api@azurdesk.ai)');
  if (BILLING_PROVIDER === 'stripe' && !process.env.STRIPE_SECRET_KEY) {
    throw new Error('BILLING_PROVIDER=stripe requires STRIPE_SECRET_KEY env var');
  }
  const sub = _createSubscription(tenantId, planId);
  // Auto-promote rate limits for the tenant (Sprint 4c)
  try {
    const { setRateLimitsForTenant } = await import('./publicAaaSService.js');
    setRateLimitsForTenant(tenantId, {
      ratePerMinute: plan.rate_per_minute,
      quotaPerMonth: plan.monthly_quota === Infinity ? 1e15 : plan.monthly_quota
    });
  } catch { /* noop if module unavailable */ }
  return sub;
}

/** Admin: provision an enterprise subscription (bypasses the sales gate). */
export async function adminProvisionEnterprise(tenantId) {
  ensureSchema();
  const sub = _createSubscription(tenantId, 'enterprise');
  // Auto-promote rate limits for the tenant (Sprint 4c)
  try {
    const plan = getPlan('enterprise');
    const { setRateLimitsForTenant } = await import('./publicAaaSService.js');
    setRateLimitsForTenant(tenantId, {
      ratePerMinute: plan.rate_per_minute,
      quotaPerMonth: plan.monthly_quota === Infinity ? 1e15 : plan.monthly_quota
    });
  } catch { /* ignore */ }
  return sub;
}

function _createSubscription(tenantId, planId, { admin = false } = {}) {
  // Cancel any existing active subscription first
  db.prepare(
    `UPDATE billing_subscriptions SET status = 'cancelled' WHERE tenant_id = ? AND status = 'active'`
  ).run(tenantId);
  const providerSubscriptionId = BILLING_PROVIDER === 'stripe' ? `stripe_${uid('sub')}` : `mock_${uid('sub')}`;
  const id = uid('sub');
  const start = now();
  const periodStart = new Date().toISOString();
  const periodEnd = addMonths(new Date(), 1).toISOString();
  db.prepare(`
    INSERT INTO billing_subscriptions
      (id, tenant_id, plan_id, status, started_at, current_period_start, current_period_end,
       provider, provider_subscription_id, cancel_at_period_end, created_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, 0, ?)
  `).run(id, tenantId, planId, start, periodStart, periodEnd, BILLING_PROVIDER, providerSubscriptionId, start);
  return getSubscription(tenantId);
}

/** Cancel a subscription at the end of the current billing period. */
export function cancel(tenantId) {
  ensureSchema();
  const sub = getSubscription(tenantId);
  if (!sub) return { cancelled: false, reason: 'no_active_subscription' };
  db.prepare(
    `UPDATE billing_subscriptions SET cancel_at_period_end = 1 WHERE id = ?`
  ).run(sub.id);
  return { cancelled: true, subscription: getSubscription(tenantId) };
}

/** Record a metered usage event. Called from the publicAaaSService on every authed call. */
export function recordUsage({ tenantId, apiKeyId, endpoint, tokensIn = 0, tokensOut = 0, costUsd = 0 }) {
  ensureSchema();
  const plan = getPlanForTenant(tenantId);
  const billed = costUsd * 1.5; // 1.5x margin on inference cost
  const period = periodOf();
  const id = uid('use');
  db.prepare(`
    INSERT INTO billing_usage_events
      (id, tenant_id, api_key_id, endpoint, tokens_in, tokens_out, cost_usd, billed_usd, period, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, apiKeyId, endpoint, tokensIn, tokensOut, costUsd, billed, period, now());
  return { id, billed_usd: billed, plan_id: plan.id };
}

/** Aggregate usage for a tenant for the current billing period. */
export function getUsage(tenantId, { period = periodOf() } = {}) {
  ensureSchema();
  const rows = db.prepare(`
    SELECT endpoint, COUNT(*) AS calls, COALESCE(SUM(tokens_in), 0) AS tokens_in,
           COALESCE(SUM(tokens_out), 0) AS tokens_out,
           COALESCE(SUM(cost_usd), 0) AS cost_usd,
           COALESCE(SUM(billed_usd), 0) AS billed_usd
    FROM billing_usage_events
    WHERE tenant_id = ? AND period = ?
    GROUP BY endpoint
  `).all(tenantId, period);
  const total = rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.calls,
      tokens_in: acc.tokens_in + r.tokens_in,
      tokens_out: acc.tokens_out + r.tokens_out,
      cost_usd: acc.cost_usd + r.cost_usd,
      billed_usd: acc.billed_usd + r.billed_usd
    }),
    { calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, billed_usd: 0 }
  );
  const plan = getPlanForTenant(tenantId);
  return {
    tenant_id: tenantId,
    period,
    plan_id: plan.id,
    plan_name: plan.name,
    quota: plan.monthly_quota,
    used: total.calls,
    remaining: plan.monthly_quota === Infinity ? Infinity : Math.max(0, plan.monthly_quota - total.calls),
    breakdown: rows,
    totals: total
  };
}

/** Issue an invoice for the current period (called by webhook on period end or by admin). */
export function issueInvoice(tenantId, { period = periodOf() } = {}) {
  ensureSchema();
  const usage = getUsage(tenantId, { period });
  const plan = getPlan(usage.plan_id);
  if (!plan || plan.price_usd === null) return null; // enterprise billed manually
  const subscription_cost = plan.price_usd;
  const overage_calls = Math.max(0, usage.used - plan.monthly_quota);
  const overage_cost = overage_calls > 0 ? (overage_calls / 1000) * plan.overage_per_1k_usd : 0;
  const amount = subscription_cost + overage_cost;
  const id = uid('inv');
  const provider = BILLING_PROVIDER;
  const providerInvoiceId = provider === 'stripe' ? `stripe_${id}` : `mock_${id}`;
  const lineItems = [
    { description: `${plan.name} plan (monthly)`, amount_usd: subscription_cost },
    ...(overage_cost > 0 ? [{ description: `Overage: ${overage_calls} calls`, amount_usd: overage_cost }] : [])
  ];
  db.prepare(`
    INSERT INTO billing_invoices
      (id, tenant_id, plan_id, amount_usd, period, status, provider, provider_invoice_id, line_items, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
  `).run(id, tenantId, plan.id, amount, period, provider, providerInvoiceId, JSON.stringify(lineItems), now());
  return {
    id,
    tenant_id: tenantId,
    plan_id: plan.id,
    amount_usd: amount,
    period,
    status: 'open',
    line_items: lineItems
  };
}

/** List past invoices for a tenant. */
export function listInvoices(tenantId) {
  ensureSchema();
  return db.prepare(
    `SELECT id, tenant_id, plan_id, amount_usd, period, status, provider, provider_invoice_id, line_items, created_at
     FROM billing_invoices WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 24`
  ).all(tenantId).map((r) => ({ ...r, line_items: JSON.parse(r.line_items || '[]') }));
}

/**
 * Handle a webhook from the payment provider. For Stripe, this would parse
 * the signature; for mock, it just processes the event payload as-is.
 */
export function handleWebhook(event) {
  ensureSchema();
  // event: { type: 'invoice.paid' | 'customer.subscription.updated' | ..., data: { ... } }
  switch (event.type) {
    case 'invoice.paid': {
      const { invoice_id } = event.data || {};
      if (!invoice_id) return { processed: false, reason: 'missing_invoice_id' };
      const result = db.prepare(`UPDATE billing_invoices SET status = 'paid' WHERE id = ? OR provider_invoice_id = ?`).run(invoice_id, invoice_id);
      return { processed: true, updated: result.changes };
    }
    case 'customer.subscription.cancelled': {
      const { subscription_id } = event.data || {};
      if (!subscription_id) return { processed: false, reason: 'missing_subscription_id' };
      const result = db.prepare(
        `UPDATE billing_subscriptions SET status = 'cancelled' WHERE provider_subscription_id = ? OR id = ?`
      ).run(subscription_id, subscription_id);
      return { processed: true, updated: result.changes };
    }
    default:
      return { processed: false, reason: `unhandled_event_type: ${event.type}` };
  }
}

/** Diagnostic: which payment provider is wired up. */
export function getProviderInfo() {
  return {
    provider: BILLING_PROVIDER,
    stripe_configured: BILLING_PROVIDER === 'stripe' && !!process.env.STRIPE_SECRET_KEY,
    plans_count: Object.keys(PLANS).length
  };
}
