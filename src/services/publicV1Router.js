// Public AaaS v1 router — exposes /v1/* for external developers.
// Mounts internal AAAS handlers with API key auth, rate limits, and v1 response shape.
//
// Route surface (mirrors internal /api/aaas/* but with v1 conventions):
//   GET  /v1/health                  - public health (no auth)
//   POST /v1/api-keys                - create API key (requires admin auth)
//   GET  /v1/api-keys                - list API keys for tenant
//   DELETE /v1/api-keys/:id          - revoke key
//   GET  /v1/aaas/models             - list available models
//   POST /v1/aaas/generate           - generate LLM completion
//   GET  /v1/aaas/usage              - usage stats for current key
//   GET  /v1/aaas/providers          - list LLM providers
//   POST /v1/aaas/providers          - add provider
//   GET  /v1/marketplace             - browse skills
//   POST /v1/marketplace/install/:id - install a skill
//   GET  /v1/marketplace/installed   - list installed skills

import {
  authenticatePublicRequest,
  publicHealth,
  publicUsage,
  createPublicApiKey,
  wrapAsV1Endpoint
} from './publicAaaSService.js';
import aaasRouterService from './aaasRouterService.js';
import { listApiKeys, revokeApiKey } from './apiKeyService.js';
import * as providerAccount from './providerAccountService.js';
import marketplaceService from './marketplaceService.js';
import {
  listPlans,
  getSubscription,
  subscribe as subscribeBilling,
  cancel as cancelBilling,
  getUsage as getBillingUsage,
  issueInvoice,
  listInvoices,
  handleWebhook,
  getProviderInfo
} from './billingV2Service.js';

const json = (res, body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };

// Resolve API key from request
function authCtx(req) {
  return authenticatePublicRequest({ headers: req.headers });
}

// Health (no auth required)
async function handleHealth(req, res) {
  json(res, { ...await publicHealth(), api_version: 'v1' });
}

// /v1/aaas/generate — meter real tokens/cost
const handleGenerate = wrapAsV1Endpoint(async (ctx, req) => {
  const body = await readJson(req);
  const startMs = Date.now();
  const result = await aaasRouterService.generate(ctx.tenantId, body || {}, { fallback: body?.fallback !== false });
  const latencyMs = Date.now() - startMs;
  // Real metering: charge the tenant for what they actually used
  if (result?.success) {
    const tokensIn = result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? 0;
    const tokensOut = result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0;
    const costUsd = result.usage?.cost_usd ?? 0;
    recordBillingUsage({
      tenantId: ctx.tenantId,
      apiKeyId: ctx.apiKeyId,
      endpoint: '/v1/aaas/generate',
      tokensIn, tokensOut, costUsd
    });
  }
  return { body: { ...(result || {}), latency_ms: latencyMs } };
});

// /v1/aaas/models
const handleModels = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, models: aaasRouterService.listAvailableModels(ctx.tenantId) } };
});

// /v1/aaas/usage
const handleUsage = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, ...publicUsage(ctx.apiKeyId) } };
});

// /v1/aaas/providers (list)
const handleListProviders = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, providers: providerAccount.listProviders(ctx.tenantId) } };
});

// /v1/api-keys
const handleListKeys = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, keys: listApiKeys(ctx.tenantId).map(k => ({ ...k, key: undefined })) } };
});

// /v1/api-keys (create)
const handleCreateKey = wrapAsV1Endpoint(async (ctx, req) => {
  const body = await readJson(req);
  if (!body?.name) return { status: 400, body: { error: 'name_required' } };
  const k = await createPublicApiKey(ctx.tenantId, { name: body.name, environment: body.environment || 'live' });
  return { status: 201, body: { success: true, key: k } };
});

// /v1/api-keys/:id (revoke)
const handleRevokeKey = wrapAsV1Endpoint(async (ctx) => {
  const id = ctx.pathParams?.id;
  if (!id) return { status: 400, body: { error: 'id_required' } };
  const result = revokeApiKey(id, ctx.tenantId);
  return { body: { success: result?.success !== false, ...result } };
});

// /v1/marketplace
const handleMarketplaceBrowse = wrapAsV1Endpoint(async (ctx, req) => {
  const url = new URL(req.url, 'http://x');
  const q = url.searchParams.get('q') || '';
  const category = url.searchParams.get('category') || '';
  const kind = url.searchParams.get('kind') || '';
  return { body: { success: true, skills: marketplaceService.search({ q, category, kind, limit: 50 }) } };
});

// /v1/marketplace/installed
const handleMarketplaceInstalled = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, skills: marketplaceService.listInstalled(ctx.tenantId) } };
});

// /v1/billing/plans (public — no auth required)
async function handleBillingPlans(req, res) {
  json(res, { success: true, plans: listPlans(), provider: getProviderInfo() });
}

// /v1/billing/subscription (read current sub)
const handleBillingGet = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, subscription: getSubscription(ctx.tenantId) } };
});

// /v1/billing/subscription (POST — subscribe to a plan)
const handleBillingSubscribe = wrapAsV1Endpoint(async (ctx, req) => {
  const body = await readJson(req);
  if (!body?.plan_id) return { status: 400, body: { error: 'plan_id_required' } };
  try {
    const sub = await subscribeBilling(ctx.tenantId, body.plan_id, { paymentMethodId: body.payment_method_id });
    return { status: 201, body: { success: true, subscription: sub, plan: getPlan(body.plan_id) } };
  } catch (e) {
    return { status: 400, body: { error: 'subscription_failed', message: e.message } };
  }
});

// /v1/billing/subscription (DELETE — cancel)
const handleBillingCancel = wrapAsV1Endpoint(async (ctx) => {
  const result = cancelBilling(ctx.tenantId);
  return { body: { success: result.cancelled, ...result } };
});

// /v1/billing/usage
const handleBillingUsage = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, usage: getBillingUsage(ctx.tenantId) } };
});

// /v1/billing/invoices
const handleBillingInvoices = wrapAsV1Endpoint(async (ctx) => {
  return { body: { success: true, invoices: listInvoices(ctx.tenantId) } };
});

// /v1/billing/invoices (POST — issue for current period)
const handleBillingIssue = wrapAsV1Endpoint(async (ctx) => {
  const inv = issueInvoice(ctx.tenantId);
  if (!inv) return { status: 400, body: { error: 'no_invoiceable_plan', message: 'Enterprise plan is billed manually' } };
  return { status: 201, body: { success: true, invoice: inv } };
});

// /v1/billing/webhook (public — no API key; signed by payment provider)
async function handleBillingWebhook(req, res) {
  const body = await readJson(req);
  const result = handleWebhook(body);
  json(res, result);
}

async function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

/**
 * Route a /v1/* request to the appropriate handler.
 * Returns { status, body, headers } for the dispatcher to write.
 */
export async function routeV1(req, res, pathname) {
  // /v1/health
  if (pathname === '/v1/health' && req.method === 'GET') {
    return handleHealth(req, res);
  }
  // /v1/aaas/generate
  if (pathname === '/v1/aaas/generate' && req.method === 'POST') {
    return respond(res, await handleGenerate(req));
  }
  // /v1/aaas/models
  if (pathname === '/v1/aaas/models' && req.method === 'GET') {
    return respond(res, await handleModels(req));
  }
  // /v1/aaas/usage
  if (pathname === '/v1/aaas/usage' && req.method === 'GET') {
    return respond(res, await handleUsage(req));
  }
  // /v1/aaas/providers
  if (pathname === '/v1/aaas/providers' && req.method === 'GET') {
    return respond(res, await handleListProviders(req));
  }
  // /v1/api-keys
  if (pathname === '/v1/api-keys' && req.method === 'GET') {
    return respond(res, await handleListKeys(req));
  }
  if (pathname === '/v1/api-keys' && req.method === 'POST') {
    return respond(res, await handleCreateKey(req));
  }
  // /v1/api-keys/:id (revoke)
  const keyMatch = pathname.match(/^\/v1\/api-keys\/([a-zA-Z0-9_-]+)$/);
  if (keyMatch && req.method === 'DELETE') {
    req.pathParams = { id: keyMatch[1] };
    return respond(res, await handleRevokeKey(req));
  }
  // /v1/marketplace
  if (pathname === '/v1/marketplace' && req.method === 'GET') {
    return respond(res, await handleMarketplaceBrowse(req));
  }
  // /v1/marketplace/installed
  if (pathname === '/v1/marketplace/installed' && req.method === 'GET') {
    return respond(res, await handleMarketplaceInstalled(req));
  }
  // /v1/billing/plans (public)
  if (pathname === '/v1/billing/plans' && req.method === 'GET') {
    return handleBillingPlans(req, res);
  }
  // /v1/billing/subscription
  if (pathname === '/v1/billing/subscription' && req.method === 'GET') {
    return respond(res, await handleBillingGet(req));
  }
  if (pathname === '/v1/billing/subscription' && req.method === 'POST') {
    return respond(res, await handleBillingSubscribe(req));
  }
  if (pathname === '/v1/billing/subscription' && req.method === 'DELETE') {
    return respond(res, await handleBillingCancel(req));
  }
  // /v1/billing/usage
  if (pathname === '/v1/billing/usage' && req.method === 'GET') {
    return respond(res, await handleBillingUsage(req));
  }
  // /v1/billing/invoices
  if (pathname === '/v1/billing/invoices' && req.method === 'GET') {
    return respond(res, await handleBillingInvoices(req));
  }
  if (pathname === '/v1/billing/invoices' && req.method === 'POST') {
    return respond(res, await handleBillingIssue(req));
  }
  // /v1/billing/webhook (public)
  if (pathname === '/v1/billing/webhook' && req.method === 'POST') {
    return handleBillingWebhook(req, res);
  }
  // Not found
  json(res, { error: 'not_found', message: `No /v1 route for ${req.method} ${pathname}` }, 404);
}

function respond(res, out) {
  if (out.headers) {
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  }
  json(res, out.body || {}, out.status || 200);
}
