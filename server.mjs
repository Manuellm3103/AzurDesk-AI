import { createServer } from 'http';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import db from './src/services/db.js';
import authService from './src/services/authService.js';
import webBuilderService from './src/webbuilder/webBuilderService.js';
import helpdeskService from './src/helpdesk/helpdeskService.js';
import generativeAI from './src/generative/generativeAIService.js';
import ChatService from './src/services/chatService.js';
import cuaService from './src/services/cuaService.js';
import memoryService from './src/services/memoryService.js';
import graphRAG from './src/ml/graphRAG.js';
import { generate as llmGenerate, listModels, routeModel, classifyComplexity, routingStats } from './src/services/llmRouter.js';
import promptCache from './src/services/promptCacheService.js';
import { TokenizerService } from './src/ml/tokenizer.js';

const tokenizer = new TokenizerService(db);
import { findSimilarArticles } from './src/ml/similaritySearch.js';
import orchestratorService from './src/services/orchestratorService.js';
import reviewService from './src/services/reviewService.js';
import documentService from './src/services/documentService.js';
import agentRegistry from './src/services/agentRegistryService.js';
import swarmProtocol from './src/services/swarmProtocolService.js';
import ollamaCloudService from './src/services/ollamaCloudService.js';
import teamRebalanceService from './src/services/teamRebalanceService.js';
import automatonService from './src/services/automatonService.js';
import agentMeshService from './src/services/agentMeshService.js';
import capacityPlannerService from './src/services/capacityPlannerService.js';
import legalCaseService from './src/services/legalCaseService.js';
import contractReviewService from './src/services/contractReviewService.js';
import radarService from './src/services/radarService.js';
import TelemetryService from './src/services/telemetryService.js';
import * as providerAccount from './src/services/providerAccountService.js';
import aaasRouter from './src/services/aaasRouterService.js';
import marketingAI from './src/services/marketingAIService.js';
import * as apiKeyService from './src/services/apiKeyService.js';
import auditService from './src/services/auditService.js';
import quotaService from './src/services/quotaService.js';
import openApiService from './src/services/openApiService.js';
import webhookService from './src/services/webhookService.js';
import promptTemplateService from './src/services/promptTemplateService.js';
import notificationService from './src/services/notificationService.js';
import tenantService from './src/services/tenantService.js';
import workflowService from './src/services/workflowService.js';
import rateLimitMiddleware from './src/services/rateLimitMiddleware.js';
import analyticsService from './src/services/analyticsService.js';
import promptOptimizationService from './src/services/promptOptimizationService.js';
import assetService from './src/services/assetService.js';
import rbacService from './src/services/rbacService.js';
import * as mcpExpandedService from './src/services/mcpExpandedService.js';
import * as mcpStreamableHttp from './src/services/mcpStreamableHttpService.js';
import embeddingService from './src/services/embeddingService.js';
import * as obsidianService from './src/services/obsidianService.js';
import * as aiNotesService from './src/services/aiNotesService.js';
import * as meetingPipelineService from './src/services/meetingPipelineService.js';
import engramService from './src/services/engramService.js';
import * as hybridRAG from './src/services/hybridRAGService.js';
import * as ticketML from './src/ml/ticketML.js';
import * as cuaAgentService from './src/services/cuaAgentService.js';
import aaasGatewayService from './src/services/aaasGatewayService.js';
import agentDAGService from './src/services/agentDAGService.js';
import a2aStandardService from './src/services/a2aStandardService.js';
import browserAgentService from './src/services/browserAgentService.js';
import mcpRegistryService from './src/services/mcpRegistryService.js';
import billingService from './src/services/billingService.js';
import agentWorkforceService from './src/services/agentWorkforceService.js';
import agenticRAGService from './src/services/agenticRAGService.js';
import abacService from './src/services/abacService.js';
import agentEvalService from './src/services/agentEvalService.js';
import agentMeshSyncService from './src/services/agentMeshSyncService.js';
import stalledSessionService from './src/services/stalledSessionService.js';
import agentRuntimeService from './src/services/agentRuntimeService.js';
import a2aService from './src/services/a2aService.js';
import eventQueueService from './src/services/eventQueueService.js';
import workerService from './src/services/workerService.js';
import localLLMRouterService from './src/services/localLLMRouterService.js';
import selfHealingService from './src/services/selfHealingService.js';
import agentHarnessService from './src/services/agentHarnessService.js';
import costRouterService from './src/services/costRouterService.js';
import * as engramV2 from './src/services/engramV2Service.js';
import guardrailsService from './src/services/guardrailsService.js';
import tracingService from './src/services/tracingService.js';
import agentTracingService from './src/services/agentTracingService.js';
import handoffService from './src/services/handoffService.js';
import durableWorkflowService from './src/services/durableWorkflowService.js';
import policyEngineService from './src/services/policyEngineService.js';
import agentSandboxService from './src/services/agentSandboxService.js';
import causalAlertingService from './src/services/causalAlertingService.js';
import remediationService from './src/services/remediationService.js';
import agentCostService from './src/services/agentCostService.js';
import durableExecutionService from './src/services/durableExecutionService.js';
import mcpGatewayService from './src/services/mcpGatewayService.js';
import failurePredictionService from './src/services/failurePredictionService.js';
import authorizationService from './src/services/authorizationService.js';
import conductorLiteService from './src/services/conductorLiteService.js';

const __dirname = (() => {
  try { return fileURLToPath(new URL('.', import.meta.url)); } catch {}
  return process.cwd();
})();

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5200;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_BODY_SIZE = parseInt(process.env.MAX_BODY_SIZE || '1048576', 10);

if (!JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET no configurado. Usando fallback inseguro para desarrollo. En producción setear JWT_SECRET de 32+ caracteres.');
}
const effectiveJwtSecret = JWT_SECRET || 'azurdesk-ai-secret-change-in-prod';

function json(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function parseMultipart(buffer, boundary) {
  const result = { fields: {}, file: null };
  const text = buffer.toString('binary');
  const parts = text.split('--' + boundary);
  for (const part of parts) {
    if (!part.includes('Content-Disposition')) continue;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd);
    const nameMatch = /name="([^"]+)"/.exec(headers);
    const filenameMatch = /filename="([^"]*)"/.exec(headers);
    const rawBody = part.slice(headerEnd + 4).replace(/\r\n$/, '');
    if (filenameMatch && filenameMatch[1]) {
      const start = buffer.indexOf(Buffer.from('\r\n\r\n', 'binary'), buffer.indexOf(Buffer.from('filename="' + filenameMatch[1] + '"', 'binary')));
      const endMarker = Buffer.from('\r\n--' + boundary, 'binary');
      const end = buffer.indexOf(endMarker, start);
      result.file = { filename: filenameMatch[1], data: buffer.slice(start + 4, end) };
    } else if (nameMatch) {
      result.fields[nameMatch[1]] = Buffer.from(rawBody, 'binary').toString('utf8');
    }
  }
  return result;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += Buffer.byteLength(c, 'utf8');
      if (size > MAX_BODY_SIZE) {
        reject(new Error(`Payload exceeds ${MAX_BODY_SIZE} bytes`));
        return;
      }
      data += c;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
    });
    req.on('error', reject);
  });
}

function requireAuth(req, res) {
  // Check for X-API-Key header first
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader) {
    const keyUser = apiKeyService.validateApiKey(apiKeyHeader);
    if (keyUser) return keyUser;
    json(res, { success: false, error: 'API key inválida' }, 401);
    return null;
  }
  // Fall back to JWT bearer
  const h = req.headers.authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token) { json(res, { success: false, error: 'Token requerido' }, 401); return null; }
  try { return jwt.verify(token, effectiveJwtSecret); } catch { json(res, { success: false, error: 'Token inválido' }, 401); return null; }
}

function requireRole(user, roles, res) {
  if (!roles.includes(user.role)) { json(res, { success: false, error: 'Sin permiso' }, 403); return false; }
  return true;
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const ticketSchema = z.object({
  requester_email: z.string().email(),
  requester_name: z.string().min(1),
  subject: z.string().min(3),
  body: z.string().min(5),
  category: z.string().optional(),
  channel: z.string().optional()
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && (pathname === '/' || pathname.startsWith('/static/') || extname(pathname))) {
    let file = pathname === '/' ? '/index.html' : pathname;
    const p = join(__dirname, 'public', file);
    if (existsSync(p)) {
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': mime[extname(p)] || 'application/octet-stream' });
      createReadStream(p).pipe(res);
      return;
    }
  }

  try {
    if (pathname === '/api/health') {
      return json(res, {
        success: true,
        name: 'AzurDesk AI',
        version: '2.6.13',
        status: 'operational',
        environment: NODE_ENV,
        checks: {
          db: db && db.open,
          jwt: !!JWT_SECRET
        }
      });
    }

    // Public endpoints (no auth)
    if (pathname === '/api/auth/login') {
      const { success, data, error } = loginSchema.safeParse(body);
      if (!success) return json(res, { success: false, error }, 400);
      const u = authService.authenticate(data.email, data.password);
      if (!u) return json(res, { success: false, error: 'Credenciales inválidas' }, 401);
      const token = jwt.sign({ id: u.id, tenant_id: u.tenant_id, email: u.email, role: u.role, level: u.level }, effectiveJwtSecret, { expiresIn: '8h' });
      return json(res, { success: true, token, user: u });
    }

    if (pathname === '/api/auth/signup' && req.method === 'POST') {
      try {
        const result = tenantService.signup(body);
        const token = jwt.sign({ id: 'new-admin', tenant_id: result.tenant_id, email: result.email, role: 'admin', level: 5 }, effectiveJwtSecret, { expiresIn: '8h' });
        return json(res, { success: true, ...result, token });
      } catch (e) {
        return json(res, { success: false, error: e.message }, 400);
      }
    }

    // Public plans endpoint
    if (pathname === '/api/plans' && req.method === 'GET') {
      return json(res, { success: true, plans: tenantService.getPlans() });
    }

    // Public AaaS v1 API — uses API key auth (not JWT) for external developers.
    // Bypass the JWT requireAuth below; routeV1 does its own API key validation.
    if (pathname.startsWith('/v1/')) {
      // OpenAPI spec — public, no auth (used by SDK generators and humans)
      if (pathname === '/v1/openapi.json' && req.method === 'GET') {
        const { buildV1OpenApiSpec } = await import('./src/services/openApiV1Service.js');
        return json(res, buildV1OpenApiSpec());
      }
      const { routeV1 } = await import('./src/services/publicV1Router.js');
      return await routeV1(req, res, pathname);
    }

    // Auth required from here
    const user = requireAuth(req, res); if (!user) return;

    if (pathname === '/api/health/db' && req.method === 'GET') {
      return json(res, { success: true, db: db && db.open, tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name) });
    }
    if (pathname === '/api/telemetry/metrics' && req.method === 'GET') {
      return json(res, { success: true, metrics: telemetry?.getMetrics?.() || {} });
    }
    if (pathname === '/api/self-healing/status' && req.method === 'GET') {
      return json(res, { success: true, status: selfHealingService.status() });
    }
    if (pathname === '/api/self-healing/heal' && req.method === 'POST') {
      const detected = selfHealingService.detectAndHeal(user.tenant_id);
      const applied = detected.map(a => selfHealingService.applyHealing(user.tenant_id, a.id));
      return json(res, { success: true, detected, applied });
    }
    if (pathname.startsWith('/api/self-healing/actions/') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const result = selfHealingService.applyHealing(user.tenant_id, id);
      return json(res, result);
    }
    if (pathname === '/api/self-healing/actions' && req.method === 'GET') {
      return json(res, { success: true, actions: selfHealingService.listHealing(user.tenant_id, parseInt(url.searchParams.get('limit') || '50')) });
    }
    if (pathname === '/api/tracing/spans' && req.method === 'GET') {
      return json(res, { success: true, spans: tracingService.listSpans(user.tenant_id, { limit: 20 }) });
    }
    if (pathname === '/api/skills' && req.method === 'GET') {
      return json(res, { success: true, skills: agentHarnessService.listSkills(user.tenant_id) });
    }

    // Rate limiting after auth
    if (!rateLimitMiddleware.rateLimit(req, res, user)) return;

    // Web Builder
    if (pathname === '/api/sites' && req.method === 'POST') {
      return json(res, webBuilderService.createSite({ ...body, tenant_id: user.tenant_id }));
    }
    if (pathname === '/api/sites' && req.method === 'GET') {
      return json(res, webBuilderService.listSites({ tenant_id: user.tenant_id }));
    }
    if (pathname.startsWith('/api/sites/') && pathname.endsWith('/export') && req.method === 'GET') {
      return json(res, webBuilderService.exportSite(pathname.split('/')[3]));
    }
    if (pathname.startsWith('/api/sites/') && req.method === 'GET') {
      return json(res, webBuilderService.getSite(pathname.split('/')[3]));
    }
    if (pathname.startsWith('/api/sites/') && req.method === 'PUT') {
      const id = pathname.split('/')[3];
      return json(res, webBuilderService.updateSite(id, body));
    }
    if (pathname === '/api/pages' && req.method === 'POST') {
      return json(res, webBuilderService.createPage(body));
    }
    if (pathname.startsWith('/api/pages/') && req.method === 'GET') {
      return json(res, webBuilderService.getPage(pathname.split('/')[3]));
    }
    if (pathname.startsWith('/api/pages/') && req.method === 'PUT') {
      return json(res, webBuilderService.updatePage(pathname.split('/')[3], body));
    }

    // AaaS Gateway: unified Agents-as-a-Service runtime
    if (pathname === '/api/agents' && req.method === 'GET') {
      return json(res, { success: true, agents: agentRuntimeService.list(user.tenant_id) });
    }
    if (pathname === '/api/agents' && req.method === 'POST') {
      const agent = agentRuntimeService.register(user.tenant_id, body);
      return json(res, { success: true, agent });
    }
    if (pathname === '/api/agents/bootstrap' && req.method === 'POST') {
      const agents = aaasGatewayService.bootstrapTenant(user.tenant_id);
      return json(res, { success: true, agents });
    }
    if (pathname === '/api/agents/intents' && req.method === 'GET') {
      return json(res, { success: true, intents: aaasGatewayService.listIntents() });
    }
    if (pathname === '/api/agents/invoke' && req.method === 'POST') {
      return json(res, await aaasGatewayService.invoke(user.tenant_id, body));
    }
    if (pathname.startsWith('/api/agents/') && pathname.endsWith('/runs') && req.method === 'GET') {
      const agentId = pathname.split('/')[3];
      return json(res, { success: true, runs: agentRuntimeService.getRuns(agentId) });
    }
    if (pathname === '/api/agents/dag' && req.method === 'POST') {
      return json(res, await agentDAGService.run({ tenant_id: user.tenant_id, ...body }));
    }

    // A2A Standard
    if (pathname === '/api/a2a/tasks' && req.method === 'POST') {
      const task = a2aStandardService.submitTask({ tenant_id: user.tenant_id, ...body });
      return json(res, { success: true, task });
    }
    if (pathname === '/api/a2a/tasks' && req.method === 'GET') {
      return json(res, { success: true, tasks: a2aStandardService.listTasks(user.tenant_id) });
    }
    if (pathname.startsWith('/api/a2a/tasks/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      const task = a2aStandardService.getTask(id);
      return json(res, { success: !!task, task });
    }
    if (pathname.startsWith('/api/a2a/tasks/') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const task = a2aStandardService.updateTask(id, body.status, { message: body.message, artifact: body.artifact });
      return json(res, { success: !!task, task });
    }

    // Browser Agent
    if (pathname === '/api/browser/navigate' && req.method === 'POST') {
      return json(res, await browserAgentService.navigate(body.url));
    }
    if (pathname === '/api/browser/extract' && req.method === 'POST') {
      return json(res, await browserAgentService.extractText(body.selector));
    }

    // MCP Registry
    if (pathname === '/api/mcp/registry' && req.method === 'GET') {
      return json(res, { success: true, servers: mcpRegistryService.search(url.searchParams.get('q') || '') });
    }
    if (pathname === '/api/mcp/registry/installed' && req.method === 'GET') {
      return json(res, { success: true, servers: mcpRegistryService.listInstalled() });
    }
    if (pathname.startsWith('/api/mcp/registry/install/') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const server = mcpRegistryService.install(id);
      return json(res, { success: !!server, server });
    }

    // Billing
    if (pathname === '/api/billing/usage' && req.method === 'GET') {
      return json(res, billingService.getUsage(user.tenant_id, url.searchParams.get('period')));
    }
    if (pathname === '/api/billing/invoice' && req.method === 'GET') {
      return json(res, billingService.getInvoice(user.tenant_id, url.searchParams.get('period')));
    }
    if (pathname === '/api/billing/summary' && req.method === 'GET') {
      return json(res, { success: true, summary: billingService.getSummary(user.tenant_id) });
    }

    // Ciclo 4: Agent Workforce, Agentic RAG, ABAC, Agent Eval, Mesh Sync
    if (pathname === '/api/workforce/schedule' && req.method === 'POST') {
      return json(res, agentWorkforceService.scheduleTask({ tenant_id: user.tenant_id, ...body }));
    }
    if (pathname === '/api/workforce/assignments' && req.method === 'GET') {
      return json(res, { success: true, assignments: agentWorkforceService.listAssignments(user.tenant_id) });
    }
    if (pathname.startsWith('/api/workforce/complete/') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      return json(res, agentWorkforceService.completeAssignment(id, body.result));
    }
    if (pathname === '/api/rag/agentic' && req.method === 'POST') {
      return json(res, await agenticRAGService.search({ tenant_id: user.tenant_id, ...body }));
    }
    if (pathname === '/api/abac/policies' && req.method === 'POST') {
      return json(res, { success: true, policy: abacService.addPolicy({ tenant_id: user.tenant_id, ...body }) });
    }
    if (pathname === '/api/abac/policies' && req.method === 'GET') {
      return json(res, { success: true, policies: abacService.listPolicies(user.tenant_id) });
    }
    if (pathname === '/api/abac/evaluate' && req.method === 'POST') {
      return json(res, abacService.evaluate({ tenant_id: user.tenant_id, ...body }));
    }
    if (pathname === '/api/agent-eval/cases' && req.method === 'POST') {
      return json(res, { success: true, case: agentEvalService.addCase({ tenant_id: user.tenant_id, ...body }) });
    }
    if (pathname === '/api/agent-eval/cases' && req.method === 'GET') {
      return json(res, { success: true, cases: agentEvalService.listCases(user.tenant_id) });
    }
    if (pathname.startsWith('/api/agent-eval/run/') && req.method === 'POST') {
      const case_id = pathname.split('/')[3];
      return json(res, await agentEvalService.runEval(user.tenant_id, case_id));
    }
    if (pathname === '/api/mesh/heartbeat' && req.method === 'POST') {
      return json(res, agentMeshSyncService.heartbeat({ tenant_id: user.tenant_id, ...body }));
    }
    if (pathname === '/api/mesh/active' && req.method === 'GET') {
      return json(res, { success: true, nodes: agentMeshSyncService.listActive(user.tenant_id) });
    }
    if (pathname === '/api/sessions/stalled' && req.method === 'GET') {
      return json(res, { success: true, sessions: stalledSessionService.detect({ tenant_id: user.tenant_id }) });
    }
    if (pathname === '/api/sessions/sweep' && req.method === 'POST') {
      return json(res, stalledSessionService.runSweep({ tenant_id: user.tenant_id, maxAgeMs: body.maxAgeMs }));
    }
    if (pathname.startsWith('/api/sessions/recover/') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      return json(res, stalledSessionService.recover(id));
    }

    // Helpdesk
    if (pathname === '/api/tickets' && req.method === 'POST') {
      const { success, data, error } = ticketSchema.safeParse(body);
      if (!success) return json(res, { success: false, error }, 400);
      return json(res, helpdeskService.createTicket({ ...data, tenant_id: user.tenant_id }));
    }
    if (pathname === '/api/tickets' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return json(res, helpdeskService.listTickets({ ...q, tenant_id: user.tenant_id }));
    }
    if (pathname.startsWith('/api/tickets/') && req.method === 'GET') {
      return json(res, helpdeskService.getTicket(pathname.split('/')[3]));
    }
    if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/escalate') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      return json(res, helpdeskService.escalateTicket(id, body, user));
    }
    if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/handoff') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const { to_agent_id, to_level, note } = body || {};
      return json(res, helpdeskService.handoffTicket(id, { from_agent_id: body.from_agent_id, to_agent_id, to_level, note }, user));
    }
    if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/comments') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      return json(res, helpdeskService.addComment({ ticket_id: id, author_id: user.id, author_name: user.name, ...body }));
    }
    if (pathname === '/api/helpdesk/metrics') {
      return json(res, helpdeskService.getMetrics({ tenant_id: user.tenant_id, days: Number(url.searchParams.get('days') || 7) }));
    }
    if (pathname === '/api/helpdesk/kanban' && req.method === 'GET') {
      return json(res, helpdeskService.kanban(user.tenant_id));
    }
    if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/move') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      return json(res, helpdeskService.moveTicket(id, body, user));
    }

    // Generative AI
    if (pathname === '/api/ai/reply' && req.method === 'POST') {
      const r = await generativeAI.generateReply({ ...body, tenant_id: user.tenant_id });
      return json(res, r);
    }
    if (pathname === '/api/ai/kb' && req.method === 'POST') {
      const r = await generativeAI.generateKBArticle({ ...body, tenant_id: user.tenant_id });
      return json(res, r);
    }
    if (pathname === '/api/ai/summary' && req.method === 'POST') {
      const r = await generativeAI.summarizeTicket({ ...body, tenant_id: user.tenant_id });
      return json(res, r);
    }
    if (pathname === '/api/ai/logs') {
      return json(res, generativeAI.listLogs({ tenant_id: user.tenant_id }));
    }
    if (pathname === '/api/kb/search') {
      const q = url.searchParams.get('q') || '';
      return json(res, { success: true, articles: findSimilarArticles(user.tenant_id, q) });
    }
    if (pathname === '/api/kb/articles' && req.method === 'POST') {
      const id = crypto.randomUUID();
      const { title, content, category, tags } = body || {};
      const t = new Date().toISOString();
      db.prepare('INSERT INTO kb_articles (id, tenant_id, title, content, category, tags, embedding, views, helpful, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, user.tenant_id, title || '', content || '', category || '', JSON.stringify(tags || []), '{}', 0, 0, t, t);
      // v2.6.14: auto-sync to embeddings vector store (incremental ingest)
      try {
        embeddingService.upsert(user.tenant_id, {
          source: 'kb_article',
          sourceId: id,
          text: `${title || ''}\n\n${content || ''}`.trim()
        });
      } catch (e) { /* non-blocking */ }
      return json(res, { success: true, article: { id, tenant_id: user.tenant_id, title, content, category, tags: tags || [] } });
    }

    // Users
    if (pathname === '/api/users' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      return json(res, authService.createUser({ ...body, tenant_id: user.tenant_id }) || { success: false, error: 'No se pudo crear usuario' });
    }
    if (pathname === '/api/users' && req.method === 'GET') {
      return json(res, { success: true, users: authService.listUsers({ tenant_id: user.tenant_id }) });
    }

    // Computer Use (CUA) — solo admin
    if (pathname === '/api/cua/capture' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const { app, mode = 'vision', max_elements } = body || {};
      const r = await cuaService.capture({ app, mode, max_elements });
      return json(res, r.success ? { success: true, ...r } : { success: false, error: r.error }, r.success ? 200 : 400);
    }
    if (pathname === '/api/cua/click' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const r = await cuaService.click(body || {});
      return json(res, r.success ? { success: true, ...r } : { success: false, error: r.error }, r.success ? 200 : 400);
    }
    if (pathname === '/api/cua/type' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const r = await cuaService.type(body || {});
      return json(res, r.success ? { success: true, ...r } : { success: false, error: r.error }, r.success ? 200 : 400);
    }
    if (pathname === '/api/cua/key' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const r = await cuaService.key(body || {});
      return json(res, r.success ? { success: true, ...r } : { success: false, error: r.error }, r.success ? 200 : 400);
    }
    if (pathname === '/api/cua/scroll' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const r = await cuaService.scroll(body || {});
      return json(res, r.success ? { success: true, ...r } : { success: false, error: r.error }, r.success ? 200 : 400);
    }

    // GraphRAG + RAG
    if (pathname === '/api/kb/graph' && req.method === 'POST') {
      const { article_id, title, content, tags } = body || {};
      if (!article_id || !title || !content) return json(res, { success: false, error: 'article_id, title y content requeridos' }, 400);
      const r = graphRAG.upsertArticleGraph({ tenant_id: user.tenant_id, article_id, title, content, tags });
      return json(res, { success: true, ...r });
    }
    if (pathname === '/api/kb/graph' && req.method === 'GET') {
      return json(res, { success: true, graph: graphRAG.getGraph(user.tenant_id) });
    }
    if (pathname === '/api/ai/rag' && req.method === 'POST') {
      const { query, mode = 'hybrid' } = body || {};
      if (!query) return json(res, { success: false, error: 'query requerida' }, 400);
      // v2.6.13: HNSW source auto-select (HNSW if corpus > 50, exact kNN otherwise)
      const embStats = embeddingService.stats(user.tenant_id);
      const useHnsw = embStats.total > 50;
      const [graphResults, semanticResults, memories, hnswResults] = await Promise.all([
        Promise.resolve(graphRAG.search({ tenant_id: user.tenant_id, query })),
        Promise.resolve(findSimilarArticles(user.tenant_id, query)),
        Promise.resolve(memoryService.recall({ tenant_id: user.tenant_id, user_id: user.id, session_id: body.session_id || 'web', query })),
        Promise.resolve(useHnsw
          ? embeddingService.hnswSearch(user.tenant_id, { query, k: 5, ef: 50 })
          : embeddingService.search(user.tenant_id, { query, k: 5 }))
      ]);
      const context = [
        ...graphResults.map((g) => g.matched.join(', ')),
        ...semanticResults.map((a) => a.title),
        ...hnswResults.map((h) => h.text || h.id)
      ];
      const prompt = `Contexto: ${context.slice(0, 5).join('; ')}\nPregunta: ${query}\nResponde en español.`;
      const complexity = classifyComplexity(prompt);
      const llm = await llmGenerate(prompt, { complexity, preferred: body.preferred, tenant_id: user.tenant_id });
      return json(res, { success: true, query, mode, graphResults, semanticResults, memories, hnswResults, hnswAlgo: useHnsw ? 'hnsw' : 'exact', embeddingStats: { total: embStats.total, algo: useHnsw ? 'hnsw' : 'exact' }, llm });
    }

    // Memory + Graph
    if (pathname === '/api/memory' && req.method === 'POST') {
      const { content, scope = 'session', importance = 1.0, confidence = 1.0, source = 'manual', session_id = 'web' } = body || {};
      if (!content) return json(res, { success: false, error: 'content requerido' }, 400);
      const r = memoryService.add({ tenant_id: user.tenant_id, user_id: user.id, session_id, scope, content, importance, confidence, source });
      return json(res, { success: true, memory: r });
    }
    if (pathname === '/api/memory' && req.method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const r = memoryService.recall({ tenant_id: user.tenant_id, user_id: user.id, session_id: url.searchParams.get('session') || 'web', query });
      return json(res, { success: true, memories: r });
    }
    if (pathname === '/api/memory/graph' && req.method === 'GET') {
      const node = url.searchParams.get('node') || null;
      const r = memoryService.graph({ tenant_id: user.tenant_id, user_id: user.id, node });
      return json(res, { success: true, graph: r });
    }

    // LLM Router
    if (pathname === '/api/llm/models') {
      return json(res, { success: true, models: listModels(), selected: routeModel({ complexity: url.searchParams.get('complexity') || 'medium' }) });
    }
    if (pathname === '/api/llm/stats') {
      return json(res, { success: true, stats: routingStats(user.tenant_id) });
    }
    if (pathname === '/api/llm/classify' && req.method === 'POST') {
      const { prompt } = body || {};
      if (!prompt) return json(res, { success: false, error: 'prompt requerido' }, 400);
      return json(res, { success: true, complexity: classifyComplexity(prompt) });
    }
    if (pathname === '/api/llm/generate' && req.method === 'POST') {
      const { prompt, complexity = 'medium', preferred, strategy = 'balanced', maxCostPer1M, fallback = true, reasoning = 'none', useCache = true, toolsSchema } = body || {};
      if (!prompt) return json(res, { success: false, error: 'prompt requerido' }, 400);
      // Prompt cache lookup (skip for high reasoning — output is too volatile)
      const cacheDisabled = !useCache || reasoning === 'high' || reasoning === 'medium';
      if (!cacheDisabled) {
        // Use a synthetic provider/model key — the actual provider is decided by the router
        const cacheKey = { modelProvider: 'router', modelName: strategy + '|' + complexity, prompt, toolsSchema };
        const cached = promptCache.get(user.tenant_id, cacheKey);
        if (cached.hit) {
          return json(res, {
            success: true,
            cached: true,
            cache_id: cached.cache_id,
            text: cached.response.text,
            cost_usd: 0,
            input_tokens: cached.input_tokens,
            output_tokens: cached.output_tokens,
            reasoning,
            strategy,
            complexity
          });
        }
      }
      const r = await llmGenerate(prompt, { complexity, preferred, strategy, maxCostPer1M, fallback, tenant_id: user.tenant_id, reasoning });
      if (r.success && !cacheDisabled) {
        promptCache.set(user.tenant_id, {
          modelProvider: 'router',
          modelName: strategy + '|' + complexity,
          prompt,
          toolsSchema,
          response: { text: r.text, provider: r.provider, model: r.model },
          inputTokens: r.input_tokens || 0,
          outputTokens: r.output_tokens || 0,
          cost: r.cost_usd || 0
        });
      }
      return json(res, { success: true, cached: false, reasoning, strategy, complexity, ...r });
    }

    // Prompt cache management endpoints
    if (pathname === '/api/llm/cache/stats' && req.method === 'GET') {
      const days = Number(new URL(req.url, 'http://x').searchParams.get('days')) || 7;
      const stats = promptCache.stats(user.tenant_id, { days });
      const totalHits = stats.reduce((s, r) => s + (r.hits || 0), 0);
      const totalMisses = stats.reduce((s, r) => s + (r.misses || 0), 0);
      const totalTokensSaved = stats.reduce((s, r) => s + (r.tokens_saved || 0), 0);
      const totalCostSaved = stats.reduce((s, r) => s + (r.cost_saved || 0), 0);
      return json(res, {
        success: true,
        stats,
        totals: { hits: totalHits, misses: totalMisses, tokens_saved: totalTokensSaved, cost_saved: totalCostSaved, hit_rate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0 }
      });
    }
    if (pathname === '/api/llm/cache/invalidate' && req.method === 'POST') {
      const { modelProvider, modelName } = body || {};
      const removed = promptCache.invalidate(user.tenant_id, { modelProvider, modelName });
      return json(res, { success: true, removed });
    }
    if (pathname === '/api/llm/cache/cleanup' && req.method === 'POST') {
      const removed = promptCache.cleanup();
      return json(res, { success: true, removed });
    }

    // Ollama Cloud Auth
    if (pathname === '/api/ollama-cloud/signin' && req.method === 'POST') {
      const { api_key, email, nickname, endpoint } = body || {};
      if (!api_key) return json(res, { success: false, error: 'api_key requerida' }, 400);
      const r = ollamaCloudService.signIn(user.tenant_id, { api_key, email, nickname, endpoint });
      return json(res, r, r.success ? 200 : 401);
    }
    if (pathname === '/api/ollama-cloud/account' && req.method === 'GET') {
      const account = ollamaCloudService.getAccount(user.tenant_id);
      return json(res, { success: true, account });
    }
    if (pathname === '/api/ollama-cloud/check' && req.method === 'POST') {
      const r = await ollamaCloudService.checkConnection(user.tenant_id);
      return json(res, r, r.success ? 200 : 502);
    }
    if (pathname === '/api/ollama-cloud/models' && req.method === 'GET') {
      return json(res, { success: true, models: ollamaCloudService.listModels(user.tenant_id) });
    }
    if (pathname === '/api/ollama-cloud/default-model' && req.method === 'POST') {
      const { model_id } = body || {};
      if (!model_id) return json(res, { success: false, error: 'model_id requerido' }, 400);
      const r = ollamaCloudService.setDefaultModel(user.tenant_id, model_id);
      return json(res, r);
    }
    if (pathname === '/api/ollama-cloud/disconnect' && req.method === 'POST') {
      return json(res, ollamaCloudService.disconnect(user.tenant_id));
    }
    if (pathname === '/api/ollama-cloud/generate' && req.method === 'POST') {
      const { prompt, model_id } = body || {};
      if (!prompt) return json(res, { success: false, error: 'prompt requerido' }, 400);
      const r = await ollamaCloudService.generate(user.tenant_id, { prompt, model_id });
      return json(res, r, r.success ? 200 : 502);
    }

    // Agent Registry & Fleet
    if (pathname === '/api/agents' && req.method === 'GET') {
      return json(res, { success: true, agents: agentRegistry.list(user.tenant_id) });
    }
    if (pathname === '/api/agents' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const { name, role, level, skills } = body || {};
      const r = agentRegistry.create(user.tenant_id, { name, role, level, skills });
      return json(res, { success: true, agent: r });
    }
    if (pathname.startsWith('/api/agents/') && pathname.endsWith('/heartbeat') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const r = agentRegistry.heartbeat(user.tenant_id, id, body.metrics || {});
      return json(res, { success: true, agent: r });
    }
    if (pathname === '/api/agents/metrics') {
      return json(res, { success: true, metrics: agentRegistry.fleetMetrics(user.tenant_id) });
    }
    if (pathname === '/api/agents/rebalance' && req.method === 'POST') {
      const agents = agentRegistry.list(user.tenant_id);
      const tickets = helpdeskService.listTickets({ tenant_id: user.tenant_id }).tickets;
      const r = teamRebalanceService.rebalance(user.tenant_id, agents, tickets, user);
      return json(res, r);
    }
    if (pathname === '/api/agents/rebalance/recommend' && req.method === 'GET') {
      const agents = agentRegistry.list(user.tenant_id);
      const tickets = helpdeskService.listTickets({ tenant_id: user.tenant_id }).tickets;
      return json(res, teamRebalanceService.recommend(user.tenant_id, agents, tickets));
    }
    if (pathname === '/api/agents/rebalance/logs' && req.method === 'GET') {
      return json(res, teamRebalanceService.logs(user.tenant_id));
    }
    if (pathname === '/api/agents/health' && req.method === 'GET') {
      const agents = agentRegistry.list(user.tenant_id);
      return json(res, teamRebalanceService.snapshot(user.tenant_id, agents));
    }

    // Agent Mesh Discovery
    if (pathname === '/api/mesh/nodes' && req.method === 'GET') {
      return json(res, { success: true, nodes: agentMeshService.list(user.tenant_id) });
    }
    if (pathname === '/api/mesh/nodes' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const r = agentMeshService.publish(user.tenant_id, body || {});
      return json(res, r);
    }
    if (pathname.startsWith('/api/mesh/nodes/') && pathname.endsWith('/heartbeat') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const r = agentMeshService.heartbeat(user.tenant_id, id, body || {});
      return json(res, { success: true, node: r });
    }
    if (pathname.startsWith('/api/mesh/nodes/') && req.method === 'DELETE') {
      if (!requireRole(user, ['admin'], res)) return;
      const id = pathname.split('/')[3];
      return json(res, agentMeshService.deactivate(user.tenant_id, id));
    }
    if (pathname === '/api/mesh/rank' && req.method === 'POST') {
      const { ticket } = body || {};
      if (!ticket) return json(res, { success: false, error: 'ticket requerido' }, 400);
      return json(res, { success: true, ranked: agentMeshService.rankForTicket(user.tenant_id, ticket) });
    }
    if (pathname === '/api/mesh/assign' && req.method === 'POST') {
      const { ticket_id, node_id, reason, score } = body || {};
      if (!ticket_id || !node_id) return json(res, { success: false, error: 'ticket_id y node_id requeridos' }, 400);
      const r = agentMeshService.assign(user.tenant_id, ticket_id, node_id, reason, score || 0);
      return json(res, r);
    }
    if (pathname === '/api/capacity/forecast' && req.method === 'GET') {
      const hours = Number(url.searchParams.get('hours') || 4);
      return json(res, capacityPlannerService.forecast({ tenant_id: user.tenant_id, hours }));
    }

    // Legal Cases
    if (pathname === '/api/legal/cases' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return json(res, legalCaseService.list(user.tenant_id, q));
    }
    if (pathname === '/api/legal/cases' && req.method === 'POST') {
      return json(res, legalCaseService.create(user.tenant_id, body || {}));
    }
    if (pathname.startsWith('/api/legal/cases/') && pathname.endsWith('/advance') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      return json(res, legalCaseService.advanceStatus(user.tenant_id, id, user));
    }
    if (pathname.startsWith('/api/legal/cases/') && pathname.endsWith('/approve') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      return json(res, legalCaseService.approve(user.tenant_id, id, body || {}, user));
    }
    if (pathname.startsWith('/api/legal/cases/') && pathname.endsWith('/tasks') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      return json(res, legalCaseService.addTask(user.tenant_id, id, body || {}));
    }
    if (pathname.startsWith('/api/legal/cases/') && pathname.endsWith('/tasks') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      return json(res, legalCaseService.listTasks(user.tenant_id, id));
    }
    if (pathname.startsWith('/api/legal/cases/') && pathname.endsWith('/notes') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      return json(res, legalCaseService.addNote(user.tenant_id, id, { author_id: user.id, author_name: user.name, ...body }));
    }
    if (pathname.startsWith('/api/legal/cases/') && pathname.endsWith('/notes') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      return json(res, legalCaseService.listNotes(user.tenant_id, id));
    }
    if (pathname.startsWith('/api/legal/cases/') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      const c = legalCaseService.get(user.tenant_id, id);
      if (!c) return json(res, { success: false, error: 'Caso no encontrado' }, 404);
      const tasks = legalCaseService.listTasks(user.tenant_id, id);
      const notes = legalCaseService.listNotes(user.tenant_id, id);
      const docs = legalCaseService.listDocuments(user.tenant_id, id);
      const contractReviews = contractReviewService.listContractReviews({ tenant_id: user.tenant_id, case_id: id });
      return json(res, { success: true, case: c, ...tasks, ...notes, ...docs, contract_reviews: contractReviews });
    }

    // Contract Review
    if (pathname === '/api/legal/contracts/reviews' && req.method === 'POST') {
      const { case_id, title, text } = body || {};
      if (!text) return json(res, { success: false, error: 'text requerido' }, 400);
      const r = contractReviewService.reviewContract({ tenant_id: user.tenant_id, case_id, title, text });
      return json(res, { success: true, review: r });
    }
    if (pathname === '/api/legal/contracts/reviews' && req.method === 'GET') {
      const case_id = url.searchParams.get('case_id') || null;
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const reviews = contractReviewService.listContractReviews({ tenant_id: user.tenant_id, case_id, limit, offset });
      return json(res, { success: true, reviews });
    }
    if (pathname.startsWith('/api/legal/contracts/reviews/') && req.method === 'GET') {
      const id = pathname.split('/')[5];
      const r = contractReviewService.getContractReview(id, user.tenant_id);
      if (!r) return json(res, { success: false, error: 'Revisión no encontrada' }, 404);
      return json(res, { success: true, review: r });
    }
    if (pathname.startsWith('/api/legal/contracts/reviews/') && req.method === 'DELETE') {
      if (!requireRole(user, ['admin', 'lawyer'], res)) return;
      const id = pathname.split('/')[5];
      const deleted = contractReviewService.deleteContractReview(id, user.tenant_id);
      return json(res, { success: deleted, deleted });
    }

    // Predictive Incident Radar
    if (pathname === '/api/radar' && req.method === 'GET') {
      const r = radarService.buildRadar({ tenant_id: user.tenant_id });
      return json(res, { success: true, radar: r });
    }

    // AAAS — Provider Accounts
    if (pathname === '/api/aaas/providers' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const { name, kind, base_url, api_key, models, priority, enabled, rate_limit_rpm, rate_limit_tpm, metadata } = body || {};
      if (!name || !kind) return json(res, { success: false, error: 'name y kind requeridos' }, 400);
      const r = providerAccount.createProvider(user.tenant_id, { name, kind, base_url, api_key, models, priority, enabled, rate_limit_rpm, rate_limit_tpm, metadata });
      return json(res, { success: true, provider: r });
    }
    if (pathname === '/api/aaas/providers' && req.method === 'GET') {
      return json(res, { success: true, providers: providerAccount.listProviders(user.tenant_id) });
    }
    if (pathname.startsWith('/api/aaas/providers/') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      const r = providerAccount.getProvider(id, user.tenant_id);
      if (!r) return json(res, { success: false, error: 'Proveedor no encontrado' }, 404);
      return json(res, { success: true, provider: r });
    }
    if (pathname.startsWith('/api/aaas/providers/') && req.method === 'PUT') {
      if (!requireRole(user, ['admin'], res)) return;
      const id = pathname.split('/')[4];
      const r = providerAccount.updateProvider(id, user.tenant_id, body || {});
      return json(res, { success: true, provider: r });
    }
    if (pathname.startsWith('/api/aaas/providers/') && req.method === 'DELETE') {
      if (!requireRole(user, ['admin'], res)) return;
      const id = pathname.split('/')[4];
      const deleted = providerAccount.deleteProvider(id, user.tenant_id);
      return json(res, { success: deleted, deleted });
    }
    if (pathname === '/api/aaas/models' && req.method === 'GET') {
      return json(res, { success: true, models: aaasRouter.listAvailableModels(user.tenant_id) });
    }
    if (pathname === '/api/aaas/generate' && req.method === 'POST') {
      const { prompt, messages, system, preferred, strategy, complexity, maxCostPer1M, max_tokens = 2048 } = body || {};
      if (!prompt && !Array.isArray(messages)) return json(res, { success: false, error: 'prompt o messages requeridos' }, 400);
      const r = await aaasRouter.generate(user.tenant_id, { prompt, messages, system, preferred, strategy, complexity, maxCostPer1M, max_tokens });
      return json(res, r, r.success ? 200 : 502);
    }
    if (pathname === '/api/aaas/usage' && req.method === 'GET') {
      return json(res, { success: true, stats: providerAccount.usageStats(user.tenant_id) });
    }

    // Marketing AI Agents
    if (pathname === '/api/marketing/agents/run' && req.method === 'POST') {
      const { kind, ctx, preferred, strategy } = body || {};
      if (!kind) return json(res, { success: false, error: 'kind requerido' }, 400);
      const r = await marketingAI.runAgent(user.tenant_id, kind, ctx || {}, { preferred, strategy });
      return json(res, r, r.success ? 200 : 502);
    }
    if (pathname === '/api/marketing/assets' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return json(res, { success: true, assets: marketingAI.listAssets(user.tenant_id, q) });
    }
    if (pathname.startsWith('/api/marketing/assets/') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      const r = marketingAI.getAsset(id, user.tenant_id);
      if (!r) return json(res, { success: false, error: 'Asset no encontrado' }, 404);
      return json(res, { success: true, asset: r });
    }
    if (pathname.startsWith('/api/marketing/assets/') && req.method === 'PATCH') {
      const id = pathname.split('/')[4];
      const r = marketingAI.updateAssetStatus(id, user.tenant_id, body.status || 'draft');
      return json(res, { success: !!r, asset: r });
    }
    if (pathname === '/api/marketing/campaigns' && req.method === 'POST') {
      const { name, goal, target_audience, channels, schedule } = body || {};
      if (!name || !goal) return json(res, { success: false, error: 'name y goal requeridos' }, 400);
      const r = marketingAI.createCampaign(user.tenant_id, { name, goal, target_audience, channels, schedule });
      return json(res, { success: true, campaign: r });
    }
    if (pathname === '/api/marketing/campaigns' && req.method === 'GET') {
      return json(res, { success: true, campaigns: marketingAI.listCampaigns(user.tenant_id) });
    }
    if (pathname.startsWith('/api/marketing/campaigns/') && pathname.endsWith('/attach') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const r = marketingAI.attachAsset(id, user.tenant_id, body.asset_id);
      return json(res, { success: !!r, campaign: r });
    }
    if (pathname.startsWith('/api/marketing/campaigns/') && pathname.endsWith('/leads') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const r = marketingAI.addLead(id, user.tenant_id, body.lead || {});
      return json(res, { success: !!r, campaign: r });
    }

    // Swarm Protocol
    if (pathname === '/api/swarm/status' && req.method === 'GET') {
      return json(res, { success: true, status: swarmProtocol.getTeamStatus(user.tenant_id) });
    }
    if (pathname === '/api/swarm/claim' && req.method === 'POST') {
      const { agent_id, task_id, task_type, files } = body || {};
      const r = swarmProtocol.claimWork(user.tenant_id, agent_id, task_id, task_type, files);
      return json(res, { success: true, claim: r });
    }
    if (pathname === '/api/swarm/heartbeat' && req.method === 'POST') {
      const { claim_id } = body || {};
      const r = swarmProtocol.heartbeat(user.tenant_id, claim_id);
      return json(res, { success: true, claim: r });
    }
    if (pathname === '/api/swarm/complete' && req.method === 'POST') {
      const { claim_id, unblocks } = body || {};
      const r = swarmProtocol.completeClaim(user.tenant_id, claim_id, unblocks);
      return json(res, { success: true, claim: r });
    }
    if (pathname === '/api/swarm/conflicts' && req.method === 'POST') {
      const { files } = body || {};
      return json(res, { success: true, conflicts: swarmProtocol.checkConflicts(user.tenant_id, files || []) });
    }
    if (pathname === '/api/swarm/messages' && req.method === 'POST') {
      const { from_agent, to_agent, channel, body: msg } = body || {};
      const r = swarmProtocol.sendMessage(user.tenant_id, { from_agent, to_agent, channel, body: msg });
      return json(res, { success: true, message: r });
    }
    if (pathname === '/api/swarm/messages' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return json(res, { success: true, messages: swarmProtocol.getMessages(user.tenant_id, q) });
    }

    // Tokenizer
    if (pathname === '/api/tokenizer/train' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const { texts, vocab_size = 4000 } = body || {};
      if (!Array.isArray(texts) || !texts.length) return json(res, { success: false, error: 'texts array requerido' }, 400);
      const r = tokenizer.train('azurdesk-default', texts, vocab_size);
      return json(res, { success: true, tokenizer: r });
    }
    if (pathname === '/api/tokenizer/encode' && req.method === 'POST') {
      if (!tokenizer.load()) return json(res, { success: false, error: 'Tokenizer no entrenado' }, 400);
      const tokens = tokenizer.encode(body.text || '');
      return json(res, { success: true, token_count: tokens.length, sample: tokens.slice(0, 20) });
    }
    if (pathname === '/api/tokenizer/decode' && req.method === 'POST') {
      if (!tokenizer.load()) return json(res, { success: false, error: 'Tokenizer no entrenado' }, 400);
      const text = tokenizer.decode(body.tokens || []);
      return json(res, { success: true, text });
    }

    // Simplicio-Loop Orchestrator
    if (pathname === '/api/orchestrator/runs' && req.method === 'POST') {
      const { goal, beads = [] } = body || {};
      if (!goal) return json(res, { success: false, error: 'goal requerido' }, 400);
      const r = orchestratorService.start({ tenant_id: user.tenant_id, user_id: user.id, goal, beads });
      return json(res, { success: true, run: r });
    }
    if (pathname === '/api/orchestrator/runs' && req.method === 'GET') {
      return json(res, { success: true, runs: orchestratorService.list(user.tenant_id) });
    }
    if (pathname.startsWith('/api/orchestrator/runs/') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      const run = orchestratorService.get(id, user.tenant_id);
      if (!run) return json(res, { success: false, error: 'No encontrado' }, 404);
      return json(res, { success: true, run });
    }
    if (pathname.startsWith('/api/orchestrator/runs/') && pathname.endsWith('/advance') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const r = orchestratorService.advance(id, user.tenant_id, body || {});
      if (!r) return json(res, { success: false, error: 'No encontrado' }, 404);
      return json(res, { success: true, run: r });
    }

    // Simplicio-Review
    if (pathname === '/api/review' && req.method === 'POST') {
      const { code } = body || {};
      if (!code) return json(res, { success: false, error: 'code requerido' }, 400);
      const r = reviewService.review(code);
      return json(res, { success: true, review: r });
    }

    // Obsidian Vault sync
    if (pathname === '/api/obsidian/notes' && req.method === 'GET') {
      const folder = url.searchParams.get('folder') || '';
      const notes = obsidianService.listNotes(folder);
      return json(res, { success: true, notes });
    }
    if (pathname === '/api/obsidian/notes' && req.method === 'POST') {
      const { title, content, folder = 'AzurDesk' } = body || {};
      if (!title || !content) return json(res, { success: false, error: 'title y content requeridos' }, 400);
      const r = obsidianService.writeNote(title, content, folder);
      return json(res, { success: true, note: r });
    }
    if (pathname === '/api/obsidian/sync' && req.method === 'POST') {
      const { folder = 'AzurDesk' } = body || {};
      const r = obsidianService.syncToKB({ tenant_id: user.tenant_id, folder });
      return json(res, { success: true, synced: r });
    }

    // Documents / OCR
    if (pathname === '/api/documents' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const chunks = [];
      let contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks);
        const boundary = contentType.split('boundary=')[1];
        const parsed = parseMultipart(raw, boundary);
        if (!parsed.file) return json(res, { success: false, error: 'Archivo requerido' }, 400);
        const r = await documentService.extract({ buffer: parsed.file.data, filename: parsed.file.filename, ocr: parsed.fields.ocr === 'true' });
        return json(res, { success: true, ...r });
      }
      // JSON con url
      const { url, ocr } = body || {};
      if (!url) return json(res, { success: false, error: 'url o archivo requerido' }, 400);
      const r = await documentService.extract({ url, ocr });
      return json(res, { success: true, ...r });
    }
    if (pathname === '/api/documents' && req.method === 'GET') {
      return json(res, { success: true, documents: documentService.list() });
    }

    // Automaton / Triggers
    if (pathname === '/api/automaton/rules' && req.method === 'GET') {
      return json(res, automatonService.list(user.tenant_id));
    }
    if (pathname === '/api/automaton/rules' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const { name, description, condition, actions, priority, enabled } = body || {};
      if (!name || !condition || !actions) return json(res, { success: false, error: 'name, condition y actions requeridos' }, 400);
      return json(res, automatonService.create(user.tenant_id, { name, description, condition, actions, priority, enabled }));
    }
    if (pathname.startsWith('/api/automaton/rules/') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      return json(res, automatonService.get(user.tenant_id, id));
    }
    if (pathname.startsWith('/api/automaton/rules/') && req.method === 'PUT') {
      const id = pathname.split('/')[4];
      return json(res, automatonService.update(user.tenant_id, id, body));
    }
    if (pathname.startsWith('/api/automaton/rules/') && req.method === 'DELETE') {
      const id = pathname.split('/')[4];
      return json(res, automatonService.delete(user.tenant_id, id));
    }
    if (pathname.startsWith('/api/automaton/rules/') && pathname.endsWith('/run') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const rule = automatonService.get(user.tenant_id, id);
      if (!rule.success) return json(res, rule, 404);
      const ticket = helpdeskService.getTicket(body.ticket_id);
      if (ticket.error) return json(res, { success: false, error: 'Ticket no encontrado' }, 404);
      return json(res, automatonService.run(user.tenant_id, ticket, user, id));
    }
    if (pathname === '/api/automaton/runs' && req.method === 'GET') {
      return json(res, automatonService.runs(user.tenant_id));
    }
    if (pathname === '/api/automaton/outbox' && req.method === 'GET') {
      return json(res, automatonService.outbox(user.tenant_id));
    }

    // API Keys
    if (pathname === '/api/api-keys' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const key = apiKeyService.createApiKey(user.tenant_id, body);
      auditService.log({ tenant_id: user.tenant_id, actor_id: user.id, action: 'api_key.create', resource_type: 'api_key', resource_id: key.id, details: { name: body.name } });
      return json(res, { success: true, ...key });
    }
    if (pathname === '/api/api-keys' && req.method === 'GET') {
      return json(res, { success: true, keys: apiKeyService.listApiKeys(user.tenant_id) });
    }
    if (pathname.startsWith('/api/api-keys/') && req.method === 'DELETE') {
      if (!requireRole(user, ['admin'], res)) return;
      const id = pathname.split('/')[3];
      const ok = apiKeyService.revokeApiKey(id, user.tenant_id);
      auditService.log({ tenant_id: user.tenant_id, actor_id: user.id, action: 'api_key.revoke', resource_type: 'api_key', resource_id: id, details: { ok } });
      return json(res, { success: ok });
    }

    // Audit Logs
    if (pathname === '/api/audit/logs' && req.method === 'GET') {
      const action = url.searchParams.get('action');
      const resource_type = url.searchParams.get('resource_type');
      const logs = auditService.listLogs(user.tenant_id, { action, resource_type, limit: parseInt(url.searchParams.get('limit') || '100'), offset: parseInt(url.searchParams.get('offset') || '0') });
      return json(res, { success: true, logs });
    }

    // Quota
    if (pathname === '/api/quota' && req.method === 'GET') {
      return json(res, { success: true, ...quotaService.getUsageSummary(user.tenant_id) });
    }
    if (pathname === '/api/quota' && req.method === 'PUT') {
      if (!requireRole(user, ['admin'], res)) return;
      return json(res, { success: true, quota: quotaService.updateQuota(user.tenant_id, body) });
    }

    // OpenAPI docs
    if (pathname === '/api/docs' && req.method === 'GET') {
      return json(res, openApiService.buildSpec());
    }

    // MCP endpoint
    if (pathname === '/api/mcp' && req.method === 'POST') {
      const mcp = await mcpExpandedService.handleMCPMessage(body, {
        tenant_id: user.tenant_id,
        workflowService,
        aaasRouter,
        marketingService: marketingAI,
        selfHealing: selfHealingService
      });
      return json(res, mcp);
    }

    // Obsidian integration
    if (pathname === '/api/obsidian/folders' && req.method === 'GET') {
      return json(res, { success: true, ...obsidianService.detectVault(), folders: obsidianService.listFolders() });
    }
    if (pathname === '/api/obsidian/notes' && req.method === 'GET') {
      const folder = url.searchParams.get('folder');
      return json(res, { success: true, notes: obsidianService.listNotes(folder) });
    }
    if (pathname === '/api/obsidian/notes/read' && req.method === 'GET') {
      const notePath = url.searchParams.get('path');
      return json(res, { success: true, content: obsidianService.readNote(notePath) });
    }
    if (pathname === '/api/obsidian/search' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const vault = obsidianService.detectVault();
      return json(res, { success: true, results: obsidianService.searchNotes(vault.path, q) });
    }

    // AI Notes generator
    if (pathname === '/api/notes/generate' && req.method === 'POST') {
      const { entity_type, entity } = body;
      let note;
      if (entity_type === 'ticket') note = aiNotesService.ticketToNote(entity);
      else if (entity_type === 'campaign') note = aiNotesService.campaignToNote(entity);
      else if (entity_type === 'analytics') note = aiNotesService.analyticsToNote(entity);
      else if (entity_type === 'meeting') note = aiNotesService.meetingToNote(entity);
      else if (entity_type === 'agent_run') note = aiNotesService.agentRunToNote(entity);
      else return json(res, 400, { success: false, error: 'entity_type inválido' });
      return json(res, { success: true, note });
    }

    // Meeting pipeline
    if (pathname === '/api/meetings/process' && req.method === 'POST') {
      const result = meetingPipelineService.processSummary({ ...body, tenant_id: user.tenant_id });
      return json(res, { success: true, result });
    }

    // Engram continuous memory
    if (pathname === '/api/memory/remember' && req.method === 'POST') {
      const mem = engramService.remember({ ...body, tenant_id: user.tenant_id });
      return json(res, { success: true, memory: mem });
    }
    if (pathname === '/api/memory/recall' && req.method === 'POST') {
      const rows = engramService.recall({ ...body, tenant_id: user.tenant_id });
      return json(res, { success: true, memories: rows });
    }
    if (pathname === '/api/memory/summaries' && req.method === 'GET') {
      const rows = engramService.getSummaries({ tenant_id: user.tenant_id, user_id: url.searchParams.get('user_id') });
      return json(res, { success: true, summaries: rows });
    }

    // Hybrid RAG search
    if (pathname === '/api/search/hybrid' && req.method === 'POST') {
      const rows = hybridRAG.hybridSearch({ ...body, tenant_id: user.tenant_id });
      return json(res, { success: true, results: rows });
    }

    // Ticket ML
    if (pathname === '/api/tickets/predict' && req.method === 'POST') {
      const model = ticketML.trainClassifier(body.samples || []);
      const prediction = ticketML.predict(model, body.text);
      return json(res, { success: true, prediction });
    }

    // CUA Agent Act
    if (pathname === '/api/agents/act' && req.method === 'POST') {
      const run = await cuaAgentService.agentAct({ ...body, tenant_id: user.tenant_id });
      return json(res, { success: true, run });
    }

    // AaaS Gateway must come after specific /api/agents/* routes
    if (pathname === '/api/agent-harness/skills' && req.method === 'POST') {
      const skill = agentHarnessService.registerSkill(user.tenant_id, body);
      return json(res, { success: true, skill });
    }
    if (pathname === '/api/agent-harness/skills' && req.method === 'GET') {
      return json(res, { success: true, skills: agentHarnessService.listSkills(user.tenant_id, url.searchParams.get('agent_id')) });
    }
    if (pathname === '/api/agent-harness/schedules' && req.method === 'POST') {
      const schedule = agentHarnessService.schedule(user.tenant_id, body);
      return json(res, { success: true, schedule });
    }
    if (pathname === '/api/agent-harness/schedules' && req.method === 'GET') {
      return json(res, { success: true, schedules: agentHarnessService.listSchedules(user.tenant_id) });
    }
    if (pathname === '/api/agent-harness/sandbox' && req.method === 'POST') {
      const run = await agentHarnessService.runSandbox(user.tenant_id, body.agent_id, body.command, body.timeoutMs);
      return json(res, { success: true, run });
    }

    // Cost Router
    if (pathname === '/api/cost-router' && req.method === 'POST') {
      const models = aaasRouter.listAvailableModels(user.tenant_id);
      const route = costRouterService.route({ tenant_id: user.tenant_id, text: body.text, availableModels: models });
      return json(res, { success: true, route });
    }

    // Guardrails
    if (pathname === '/api/guardrails/rules' && req.method === 'POST') {
      const rule = guardrailsService.createRule(user.tenant_id, body);
      return json(res, { success: true, rule });
    }
    if (pathname === '/api/guardrails/rules' && req.method === 'GET') {
      return json(res, { success: true, rules: guardrailsService.listRules(user.tenant_id) });
    }
    if (pathname === '/api/guardrails/check' && req.method === 'POST') {
      const result = guardrailsService.check(user.tenant_id, body.scope, body.text);
      return json(res, { success: true, result });
    }

    // Tracing
    if (pathname.startsWith('/api/tracing/runs/')) {
      const run_id = pathname.split('/').pop();
      return json(res, { success: true, traces: tracingService.getRun(user.tenant_id, run_id) });
    }

    // Handoffs
    if (pathname === '/api/handoffs' && req.method === 'POST') {
      const h = handoffService.escalate(user.tenant_id, { ...body, ticket_id: body.ticket_id || 'ticket-' + Date.now() });
      return json(res, { success: true, handoff: h });
    }

    // Durable Workflows
    if (pathname === '/api/workflows/durable' && req.method === 'POST') {
      const wf = durableWorkflowService.create(user.tenant_id, body);
      return json(res, { success: true, workflow: wf });
    }
    if (pathname === '/api/workflows/durable' && req.method === 'GET') {
      return json(res, { success: true, workflows: durableWorkflowService.list(user.tenant_id) });
    }
    if (pathname === '/api/durable-executions' && req.method === 'GET') {
      return json(res, { success: true, executions: durableExecutionService.list(user.tenant_id, { limit: 50 }) });
    }
    if (pathname === '/api/durable-executions' && req.method === 'POST') {
      const e = durableExecutionService.start(user.tenant_id, body || {});
      return json(res, { success: true, execution: e });
    }
    if (pathname.startsWith('/api/durable-executions/') && req.method === 'GET') {
      const id = pathname.split('/').pop();
      return json(res, { success: true, execution: durableExecutionService.get(user.tenant_id, id) });
    }

    // Conductor-lite Workflows
    if (pathname === '/api/conductor/workflows' && req.method === 'POST') {
      const wf = conductorLiteService.defineWorkflow(user.tenant_id, body);
      return json(res, { success: true, workflow: wf });
    }
    if (pathname === '/api/conductor/workflows' && req.method === 'GET') {
      return json(res, { success: true, workflows: conductorLiteService.listWorkflows(user.tenant_id) });
    }
    if (pathname.startsWith('/api/conductor/workflows/') && pathname.endsWith('/runs') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const run = conductorLiteService.startRun(user.tenant_id, id, body, durableExecutionService);
      return json(res, { success: true, run });
    }
    if (pathname.startsWith('/api/conductor/workflows/') && !pathname.endsWith('/runs') && !pathname.endsWith('/resume') && req.method === 'GET') {
      const id = pathname.split('/').pop();
      const wf = conductorLiteService.getWorkflow(user.tenant_id, id);
      if (!wf) return send404(res, 'Not found');
      return json(res, { success: true, workflow: wf });
    }
    if (pathname === '/api/conductor/runs' && req.method === 'POST') {
      const run = conductorLiteService.startRun(user.tenant_id, body.workflow_id, body.context || {}, durableExecutionService);
      return json(res, { success: true, run });
    }
    if (pathname === '/api/conductor/runs' && req.method === 'GET') {
      return json(res, { success: true, runs: conductorLiteService.listRuns(user.tenant_id) });
    }
    if (pathname.startsWith('/api/conductor/runs/') && req.method === 'GET') {
      const id = pathname.split('/').pop();
      const run = conductorLiteService.getRun(user.tenant_id, id);
      if (!run) return send404(res, 'Not found');
      return json(res, { success: true, run });
    }
    if (pathname.startsWith('/api/conductor/runs/') && pathname.endsWith('/resume') && req.method === 'POST') {
      const id = pathname.split('/')[4];
      const run = await conductorLiteService.resumeRun(user.tenant_id, id, { durableExec: durableExecutionService });
      return json(res, { success: true, run });
    }
    if (pathname.startsWith('/api/conductor/runs/') && pathname.endsWith('/events') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      return json(res, { success: true, events: conductorLiteService.getRunEvents(user.tenant_id, id) });
    }

    // A2A cards
    if (pathname === '/api/a2a/cards' && req.method === 'POST') {
      const card = a2aService.sendCard(user.tenant_id, { ...body, secret: process.env.A2A_SECRET || 'a2a-local-secret' });
      return json(res, { success: true, card });
    }
    if (pathname === '/api/a2a/inbox' && req.method === 'GET') {
      const cards = a2aService.receiveCards(user.tenant_id, url.searchParams.get('agent_id') || '', process.env.A2A_SECRET || 'a2a-local-secret');
      return json(res, { success: true, cards });
    }
    if (pathname.startsWith('/api/a2a/cards/') && req.method === 'PATCH') {
      const id = pathname.split('/').pop();
      const r = a2aService.updateStatus(id, user.tenant_id, body.status, body.result);
      return json(res, { success: true, updated: r });
    }
    if (pathname === '/api/a2a/cards' && req.method === 'GET') {
      return json(res, { success: true, cards: a2aService.list(user.tenant_id) });
    }
    // A2A streaming inbox — NDJSON over chunked transfer (2026 pattern, A2A protocol friendly)
    if (pathname === '/api/a2a/stream' && req.method === 'GET') {
      const agentId = url.searchParams.get('agent_id') || '';
      const secret = process.env.A2A_SECRET || 'a2a-local-secret';
      const intervalMs = Math.max(500, Math.min(10000, Number(url.searchParams.get('interval_ms')) || 2000));
      const maxBatches = Math.max(1, Math.min(60, Number(url.searchParams.get('max_batches')) || 5));
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      let batches = 0;
      let closed = false;
      const write = (obj) => {
        if (closed) return;
        try { res.write(JSON.stringify(obj) + '\n'); } catch { closed = true; }
      };
      write({ event: 'open', tenant_id: user.tenant_id, agent_id: agentId, interval_ms: intervalMs, ts: new Date().toISOString() });
      const tick = () => {
        if (closed || batches >= maxBatches) {
          write({ event: 'close', batches, ts: new Date().toISOString() });
          try { res.end(); } catch {}
          closed = true;
          return;
        }
        try {
          const cards = a2aService.receiveCards(user.tenant_id, agentId, secret);
          write({ event: 'batch', index: batches, count: cards.length, cards, ts: new Date().toISOString() });
        } catch (e) {
          write({ event: 'error', error: e.message, ts: new Date().toISOString() });
        }
        batches++;
      };
      const timer = setInterval(tick, intervalMs);
      tick();
      req.on('close', () => { closed = true; clearInterval(timer); });
      return;
    }

    // Local LLM router
    if (pathname === '/api/local-llm/models' && req.method === 'POST') {
      const model = localLLMRouterService.register(user.tenant_id, body);
      return json(res, { success: true, model });
    }
    if (pathname === '/api/local-llm/models' && req.method === 'GET') {
      return json(res, { success: true, models: localLLMRouterService.list(user.tenant_id) });
    }
    if (pathname === '/api/local-llm/route' && req.method === 'POST') {
      return json(res, { success: true, route: localLLMRouterService.route(user.tenant_id, body) });
    }
    if (pathname === '/api/local-llm/generate' && req.method === 'POST') {
      return json(res, await localLLMRouterService.generate(user.tenant_id, body));
    }

    // Event queue admin
    if (pathname.startsWith('/api/queue/') && req.method === 'GET') {
      const queue = pathname.slice('/api/queue/'.length).split('/')[0];
      return json(res, { success: true, jobs: eventQueueService.list(queue) });
    }

    // OpenTelemetry / Self-healing
    if (pathname === '/api/otel/traces' && req.method === 'POST') {
      const span = selfHealingService.startSpan(user.tenant_id, body);
      return json(res, { success: true, span });
    }
    if (pathname.startsWith('/api/otel/traces/') && req.method === 'PATCH') {
      const id = pathname.split('/').pop();
      const r = selfHealingService.endSpan(id, body);
      return json(res, { success: true, updated: r });
    }
    if (pathname === '/api/otel/traces' && req.method === 'GET') {
      return json(res, { success: true, trace: selfHealingService.getTrace(url.searchParams.get('trace_id')) });
    }
    if (pathname === '/api/self-heal' && req.method === 'POST') {
      return json(res, { success: true, actions: selfHealingService.detectAndHeal(user.tenant_id) });
    }
    if (pathname === '/api/self-heal/actions' && req.method === 'GET') {
      return json(res, { success: true, actions: selfHealingService.listHealing(user.tenant_id) });
    }

// Agent Tracing Endpoints
    if (pathname === '/api/traces/start' && req.method === 'POST') {
      const span = agentTracingService.startSpan(body);
      return json(res, { success: true, span });
    }
    if (pathname === '/api/traces/end' && req.method === 'POST') {
      const { span_id, ...rest } = body;
      const updated = agentTracingService.endSpan(span_id, rest);
      return json(res, { success: true, span: updated });
    }
    if (pathname.startsWith('/api/traces/') && req.method === 'GET') {
      const parts = pathname.split('/');
      const traceId = parts[2]; // /api/traces/:traceId
      if (traceId) {
        const trace = agentTracingService.getTraceById(traceId);
        return json(res, { success: true, trace: trace || [] });
      }
      // If no traceId, then list traces for tenant with optional filters
      const traces = agentTracingService.getTracesByTenant({
        tenant_id: user.tenant_id,
        start_date: url.searchParams.get('start_date'),
        end_date: url.searchParams.get('end_date'),
        operation: url.searchParams.get('operation'),
        status: url.searchParams.get('status'),
        limit: parseInt(url.searchParams.get('limit') || '100')
      });
      return json(res, { success: true, traces });
    }
    if (pathname === '/api/traces/aggregates' && req.method === 'GET') {
      const aggregates = agentTracingService.getTraceAggregates({
        tenant_id: user.tenant_id,
        start_date: url.searchParams.get('start_date'),
        end_date: url.searchParams.get('end_date'),
        limit: parseInt(url.searchParams.get('limit') || '30')
      });
      return json(res, { success: true, aggregates });
    }
    if (pathname === '/api/traces/model-cost' && req.method === 'POST') {
      if (!requireRole(user, ['admin'], res)) return;
      const cost = agentTracingService.upsertModelCost(body);
      return json(res, { success: true, cost });
    }

// Policy Engine
    if (pathname === '/api/policies' && req.method === 'POST') {
      const policy = policyEngineService.createPolicy(user.tenant_id, body);
      return json(res, { success: true, policy });
    }
    if (pathname === '/api/policies' && req.method === 'GET') {
      return json(res, { success: true, policies: policyEngineService.listPolicies(user.tenant_id, { resource: url.searchParams.get('resource'), action: url.searchParams.get('action') }) });
    }
    if (pathname.startsWith('/api/policies/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, policy: policyEngineService.getPolicy(id) });
    }
    if (pathname.startsWith('/api/policies/') && req.method === 'PATCH') {
      const id = pathname.split('/')[3];
      const policy = policyEngineService.updatePolicy(id, user.tenant_id, body);
      return json(res, { success: true, policy });
    }
    if (pathname.startsWith('/api/policies/') && req.method === 'DELETE') {
      const id = pathname.split('/')[3];
      return json(res, { success: policyEngineService.deletePolicy(id, user.tenant_id) });
    }
    if (pathname === '/api/policies/decide' && req.method === 'POST') {
      const decision = policyEngineService.decide(user.tenant_id, body.resource, body.action, body.context || {});
      return json(res, { success: true, decision });
    }
    if (pathname === '/api/policies/decisions' && req.method === 'GET') {
      return json(res, { success: true, decisions: policyEngineService.listDecisions(user.tenant_id, { limit: parseInt(url.searchParams.get('limit') || '50') }) });
    }

    // Agent Sandboxes
    if (pathname === '/api/sandboxes' && req.method === 'POST') {
      const sb = agentSandboxService.createSandbox(user.tenant_id, body.agent_id, body);
      return json(res, { success: true, sandbox: sb });
    }
    if (pathname === '/api/sandboxes' && req.method === 'GET') {
      return json(res, { success: true, sandboxes: agentSandboxService.listSandboxes(user.tenant_id, { status: url.searchParams.get('status') }) });
    }
    if (pathname.startsWith('/api/sandboxes/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, sandbox: agentSandboxService.getSandbox(id) });
    }
    if (pathname.startsWith('/api/sandboxes/') && req.method === 'PATCH') {
      const parts = pathname.split('/');
      const id = parts[3];
      const op = parts[4];
      if (op === 'start') {
        const sb = agentSandboxService.startSandbox(id, user.tenant_id);
        return json(res, { success: !!sb, sandbox: sb });
      }
      if (op === 'stop') {
        const sb = agentSandboxService.stopSandbox(id, user.tenant_id, { result: body.result });
        return json(res, { success: !!sb, sandbox: sb });
      }
      if (op === 'execute') {
        const out = agentSandboxService.executeInSandbox(id, user.tenant_id, body);
        return json(res, { success: true, result: out });
      }
      return json(res, { success: false, error: 'unknown op' }, 400);
    }
    if (pathname.startsWith('/api/sandboxes/') && req.method === 'DELETE') {
      const id = pathname.split('/')[3];
      return json(res, { success: agentSandboxService.deleteSandbox(id, user.tenant_id) });
    }
    if (pathname === '/api/sandboxes/executions' && req.method === 'GET') {
      return json(res, { success: true, executions: agentSandboxService.listExecutions(user.tenant_id, { sandbox_id: url.searchParams.get('sandbox_id'), limit: parseInt(url.searchParams.get('limit') || '50') }) });
    }

    // Causal Alerting
    if (pathname === '/api/causal-alerts/ingest' && req.method === 'POST') {
      const alert = causalAlertingService.ingestMetric(user.tenant_id, body);
      return json(res, { success: true, alert });
    }
    if (pathname === '/api/causal-alerts' && req.method === 'GET') {
      return json(res, { success: true, alerts: causalAlertingService.listAlerts(user.tenant_id, { status: url.searchParams.get('status'), severity: url.searchParams.get('severity'), limit: parseInt(url.searchParams.get('limit') || '50') }) });
    }
    if (pathname.startsWith('/api/causal-alerts/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, alert: causalAlertingService.getAlert(id), correlations: causalAlertingService.getCorrelations(id) });
    }
    if (pathname.startsWith('/api/causal-alerts/') && req.method === 'PATCH') {
      const id = pathname.split('/')[3];
      const alert = causalAlertingService.updateAlertStatus(id, user.tenant_id, body.status);
      return json(res, { success: !!alert, alert });
    }

    // Webhooks
    if (pathname === '/api/webhooks/deliveries' && req.method === 'GET') {
      const status = url.searchParams.get('status');
      return json(res, { success: true, deliveries: webhookService.listDeliveries(user.tenant_id, { status }) });
    }

    // Prompt Templates
    if (pathname === '/api/prompts' && req.method === 'POST') {
      const tmpl = promptTemplateService.createTemplate(user.tenant_id, body);
      auditService.log({ tenant_id: user.tenant_id, actor_id: user.id, action: 'prompt.create', resource_type: 'prompt_template', resource_id: tmpl.id });
      return json(res, { success: true, template: tmpl });
    }
    if (pathname === '/api/prompts' && req.method === 'GET') {
      const category = url.searchParams.get('category');
      return json(res, { success: true, templates: promptTemplateService.listTemplates(user.tenant_id, { category }) });
    }
    if (pathname.startsWith('/api/prompts/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, template: promptTemplateService.getTemplate(id, user.tenant_id) });
    }
    if (pathname.startsWith('/api/prompts/') && req.method === 'PUT') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, template: promptTemplateService.updateTemplate(id, user.tenant_id, body) });
    }
    if (pathname.startsWith('/api/prompts/') && req.method === 'DELETE') {
      const id = pathname.split('/')[3];
      return json(res, { success: promptTemplateService.deleteTemplate(id, user.tenant_id) });
    }
    if (pathname.startsWith('/api/prompts/') && pathname.endsWith('/execute') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const result = await promptTemplateService.executeTemplate(user.tenant_id, id, body.vars || {}, body.options || {});
      return json(res, result);
    }

    // Notifications
    if (pathname === '/api/notifications' && req.method === 'GET') {
      return json(res, { success: true, notifications: notificationService.listNotifications(user.tenant_id, { unread_only: url.searchParams.get('unread') === '1' }) });
    }
    if (pathname === '/api/notifications/unread-count' && req.method === 'GET') {
      return json(res, { success: true, count: notificationService.unreadCount(user.tenant_id) });
    }
    if (pathname === '/api/notifications/read-all' && req.method === 'POST') {
      return json(res, { success: true, marked: notificationService.markAllRead(user.tenant_id) });
    }
    if (pathname.startsWith('/api/notifications/') && req.method === 'POST' && pathname.endsWith('/read')) {
      const id = pathname.split('/')[3];
      return json(res, { success: notificationService.markRead(id, user.tenant_id) });
    }

    // AI Workflows
    if (pathname === '/api/workflows' && req.method === 'POST') {
      const wf = workflowService.createWorkflow(user.tenant_id, body);
      return json(res, { success: true, workflow: wf });
    }
    if (pathname === '/api/workflows' && req.method === 'GET') {
      return json(res, { success: true, workflows: workflowService.listWorkflows(user.tenant_id) });
    }
    if (pathname.startsWith('/api/workflows/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, workflow: workflowService.getWorkflow(id, user.tenant_id) });
    }
    if (pathname.startsWith('/api/workflows/') && req.method === 'PUT') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, workflow: workflowService.updateWorkflow(id, user.tenant_id, body) });
    }
    if (pathname.startsWith('/api/workflows/') && req.method === 'DELETE') {
      const id = pathname.split('/')[3];
      return json(res, { success: workflowService.deleteWorkflow(id, user.tenant_id) });
    }
    if (pathname.startsWith('/api/workflows/') && pathname.endsWith('/run') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const result = await workflowService.runWorkflow(user.tenant_id, id, body.inputs || {});
      return json(res, result);
    }

    // SSE streaming for AAAS generate
    if (pathname === '/api/aaas/stream' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        const result = await aaasRouter.generate(user.tenant_id, body, {
          stream: true,
          onChunk: (text) => send('chunk', { text })
        });
        if (result.success) {
          send('done', { provider: result.provider, model: result.model, latency_ms: result.latency_ms, cost_usd: result.cost_usd });
        } else {
          send('error', { error: result.error });
        }
      } catch (e) {
        send('error', { error: e.message });
      }
      res.end();
      return;
    }

    // Tenant management
    if (pathname === '/api/tenant' && req.method === 'GET') {
      const signup = tenantService.getSignup(user.tenant_id);
      const quota = quotaService.getUsageSummary(user.tenant_id);
      return json(res, { success: true, tenant_id: user.tenant_id, plan: signup?.plan || 'free', company_name: signup?.company_name || '', quota });
    }
    if (pathname === '/api/tenant/upgrade' && req.method === 'POST') {
      const result = tenantService.upgradePlan(user.tenant_id, body.plan);
      return json(res, { success: true, ...result });
    }

    // Analytics
    if (pathname === '/api/analytics/summary' && req.method === 'GET') {
      rbacService.require(user, 'analytics', 'read');
      const period = url.searchParams.get('period') || '7d';
      return json(res, { success: true, summary: analyticsService.getTenantSummary(user.tenant_id, period) });
    }
    if (pathname === '/api/analytics/rankings' && req.method === 'GET') {
      rbacService.require(user, 'analytics', 'read');
      return json(res, { success: true, rankings: analyticsService.getUsageRankings(20) });
    }
    if (pathname === '/api/analytics/top-models' && req.method === 'GET') {
      rbacService.require(user, 'analytics', 'read');
      return json(res, { success: true, models: analyticsService.getGlobalTopModels(10) });
    }
    if (pathname === '/api/analytics/tickets' && req.method === 'GET') {
      return json(res, { success: true, tickets: analyticsService.getTenantSummary(user.tenant_id, url.searchParams.get('period') || '7d') });
    }

    // Prompt Optimization
    if (pathname.startsWith('/api/prompts/') && pathname.endsWith('/variants') && req.method === 'POST') {
      const templateId = pathname.split('/')[3];
      rbacService.require(user, 'prompts', 'write');
      const variant = promptOptimizationService.createVariant(templateId, body.variant_label, body.content);
      return json(res, { success: true, variant });
    }
    if (pathname.startsWith('/api/prompts/') && pathname.endsWith('/variants') && req.method === 'GET') {
      const templateId = pathname.split('/')[3];
      return json(res, { success: true, variants: promptOptimizationService.listVariants(templateId) });
    }
    if (pathname.startsWith('/api/prompts/') && pathname.endsWith('/variants/best') && req.method === 'GET') {
      const templateId = pathname.split('/')[3];
      return json(res, { success: true, variant: promptOptimizationService.getBestVariant(templateId) });
    }
    if (pathname.startsWith('/api/prompts/') && pathname.endsWith('/variants/feedback') && req.method === 'POST') {
      const templateId = pathname.split('/')[3];
      rbacService.require(user, 'prompts', 'write');
      promptOptimizationService.recordFeedback(body.variant_id, body.rating);
      return json(res, { success: true });
    }

    // Assets
    if (pathname === '/api/assets' && req.method === 'GET') {
      rbacService.require(user, 'assets', 'read');
      return json(res, { success: true, assets: assetService.listAssets(user.tenant_id), stats: assetService.getStorageStats(user.tenant_id) });
    }
    if (pathname === '/api/assets' && req.method === 'POST') {
      rbacService.require(user, 'assets', 'write');
      try {
        const file = body;
        const asset = await assetService.upload(user.tenant_id, file.filename, Buffer.from(file.content || '', 'base64'), file.mime_type);
        return json(res, { success: true, asset });
      } catch (e) {
        return json(res, { success: false, error: e.message }, 400);
      }
    }
    if (pathname.startsWith('/api/assets/') && req.method === 'DELETE') {
      rbacService.require(user, 'assets', 'write');
      const id = pathname.split('/')[3];
      return json(res, { success: await assetService.deleteAsset(id, user.tenant_id) });
    }

    // RBAC
    if (pathname === '/api/rbac/me' && req.method === 'GET') {
      return json(res, { success: true, role: user.role, permissions: rbacService.listPermissions(user.role) });
    }
    if (pathname === '/api/rbac/check' && req.method === 'POST') {
      return json(res, { success: true, allowed: rbacService.can(user, body.resource, body.action) });
    }
    if (pathname === '/api/rbac/roles' && req.method === 'GET') {
      rbacService.require(user, 'tenant', 'read');
      return json(res, { success: true, roles: rbacService.listRoles() });
    }
    if (pathname === '/api/rbac/grant' && req.method === 'POST') {
      rbacService.require(user, 'tenant', 'write');
      return json(res, { success: true, permission: rbacService.grantPermission(body.role, body.resource, body.action) });
    }
    if (pathname === '/api/rbac/revoke' && req.method === 'POST') {
      rbacService.require(user, 'tenant', 'write');
      return json(res, { success: rbacService.revokePermission(body.role, body.resource, body.action) });
    }

    // Remediation DSL
    if (pathname === '/api/remediation/rules' && req.method === 'POST') {
      const rule = remediationService.createRule(user.tenant_id, body);
      return json(res, { success: true, rule });
    }
    if (pathname === '/api/remediation/rules' && req.method === 'GET') {
      return json(res, { success: true, rules: remediationService.listRules(user.tenant_id, { enabled: url.searchParams.get('enabled') }) });
    }
    if (pathname.startsWith('/api/remediation/rules/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, rule: remediationService.getRule(id) });
    }
    if (pathname.startsWith('/api/remediation/rules/') && req.method === 'PATCH') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, rule: remediationService.updateRule(id, user.tenant_id, body) });
    }
    if (pathname.startsWith('/api/remediation/rules/') && req.method === 'DELETE') {
      const id = pathname.split('/')[3];
      return json(res, { success: remediationService.deleteRule(id, user.tenant_id) });
    }
    if (pathname.startsWith('/api/remediation/rules/') && pathname.endsWith('/run') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const result = await remediationService.runRule(user.tenant_id, id, body.alert_id || null, body.context || {});
      return json(res, { success: true, result });
    }
    if (pathname === '/api/remediation/runs' && req.method === 'GET') {
      return json(res, { success: true, runs: remediationService.listRuns(user.tenant_id, { rule_id: url.searchParams.get('rule_id'), status: url.searchParams.get('status') }) });
    }

    // Cost Attribution
    if (pathname === '/api/costs/charges' && req.method === 'POST') {
      const charge = agentCostService.recordCharge(user.tenant_id, body);
      return json(res, { success: true, charge });
    }
    if (pathname === '/api/costs/charges' && req.method === 'GET') {
      return json(res, { success: true, charges: agentCostService.getCharges(user.tenant_id, { agent_id: url.searchParams.get('agent_id'), session_id: url.searchParams.get('session_id'), resource: url.searchParams.get('resource') }) });
    }
    if (pathname === '/api/costs/summary' && req.method === 'GET') {
      return json(res, { success: true, summary: agentCostService.summarizeByResource(user.tenant_id, { period: url.searchParams.get('period') }) });
    }
    if (pathname === '/api/costs/agents' && req.method === 'GET') {
      return json(res, { success: true, agents: agentCostService.summarizeByAgent(user.tenant_id) });
    }
    if (pathname === '/api/costs/totals' && req.method === 'GET') {
      return json(res, { success: true, totals: agentCostService.getTotals(user.tenant_id, { period: url.searchParams.get('period') }) });
    }
    if (pathname === '/api/costs/estimate' && req.method === 'POST') {
      return json(res, { success: true, estimate: agentCostService.estimateLLM(user.tenant_id, body) });
    }

    // Durable Execution Engine
    if (pathname === '/api/executions' && req.method === 'POST') {
      const ex = durableExecutionService.start(user.tenant_id, body);
      return json(res, { success: true, execution: ex });
    }
    if (pathname === '/api/executions' && req.method === 'GET') {
      return json(res, { success: true, executions: durableExecutionService.list(user.tenant_id, { status: url.searchParams.get('status'), limit: parseInt(url.searchParams.get('limit') || '50'), offset: parseInt(url.searchParams.get('offset') || '0') }) });
    }
    if (pathname.startsWith('/api/executions/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, execution: durableExecutionService.get(user.tenant_id, id) });
    }
    if (pathname.startsWith('/api/executions/') && pathname.endsWith('/events') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      return json(res, { success: true, events: durableExecutionService.events(user.tenant_id, id) });
    }
    if (pathname.startsWith('/api/executions/') && pathname.endsWith('/events') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const ex = durableExecutionService.recordEvent(user.tenant_id, id, body);
      return json(res, { success: true, execution: ex });
    }
    if (pathname.startsWith('/api/executions/') && pathname.endsWith('/complete') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const ex = durableExecutionService.complete(user.tenant_id, id, body.result);
      return json(res, { success: true, execution: ex });
    }
    if (pathname.startsWith('/api/executions/') && req.method === 'DELETE') {
      const id = pathname.split('/')[3];
      return json(res, { success: durableExecutionService.delete(user.tenant_id, id) });
    }

    // MCP Gateway
    if (pathname === '/api/mcp/gateway/tools' && req.method === 'POST') {
      const tool = mcpGatewayService.registerTool(user.tenant_id, body);
      return json(res, { success: true, tool });
    }
    if (pathname === '/api/mcp/gateway/tools' && req.method === 'GET') {
      return json(res, { success: true, tools: mcpGatewayService.listTools(user.tenant_id, { server_id: url.searchParams.get('server_id'), enabled: url.searchParams.has('enabled') ? url.searchParams.get('enabled') === 'true' : undefined }) });
    }
    if (pathname.startsWith('/api/mcp/gateway/tools/') && req.method === 'PATCH') {
      const id = pathname.split('/')[5];
      const tool = mcpGatewayService.updateTool(user.tenant_id, id, body);
      return json(res, { success: true, tool });
    }
    if (pathname.startsWith('/api/mcp/gateway/tools/') && req.method === 'DELETE') {
      const id = pathname.split('/')[5];
      return json(res, { success: mcpGatewayService.deleteTool(user.tenant_id, id) });
    }
    if (pathname === '/api/mcp/gateway/call' && req.method === 'POST') {
      const result = await mcpGatewayService.call(user.tenant_id, body.tool_id, body.input);
      return json(res, result);
    }
    if (pathname === '/api/mcp/gateway/calls' && req.method === 'GET') {
      return json(res, { success: true, calls: mcpGatewayService.calls(user.tenant_id, { tool_id: url.searchParams.get('tool_id'), limit: parseInt(url.searchParams.get('limit') || '50'), offset: parseInt(url.searchParams.get('offset') || '0') }) });
    }
    if (pathname === '/api/mcp/gateway/totals' && req.method === 'GET') {
      return json(res, { success: true, totals: mcpGatewayService.totals(user.tenant_id, { since: url.searchParams.get('since') }) });
    }

    // Failure Prediction
    if (pathname === '/api/failure-prediction/signals' && req.method === 'POST') {
      const signal = failurePredictionService.recordSignal(user.tenant_id, body);
      return json(res, { success: true, signal });
    }
    if (pathname === '/api/failure-prediction/signals' && req.method === 'GET') {
      return json(res, { success: true, signals: failurePredictionService.listSignals(user.tenant_id, {
        signal_type: url.searchParams.get('signal_type'),
        entity_type: url.searchParams.get('entity_type'),
        entity_id: url.searchParams.get('entity_id'),
        limit: parseInt(url.searchParams.get('limit') || '100')
      }) });
    }
    if (pathname === '/api/failure-prediction/predict' && req.method === 'POST') {
      const prediction = failurePredictionService.predict(user.tenant_id, body.entity_type, body.entity_id, body.signals || []);
      return json(res, { success: true, prediction });
    }
    if (pathname === '/api/failure-prediction/scan' && req.method === 'POST') {
      const prediction = failurePredictionService.scanTenant(user.tenant_id);
      return json(res, { success: true, prediction });
    }
    if (pathname === '/api/failure-prediction/predictions' && req.method === 'GET') {
      return json(res, { success: true, predictions: failurePredictionService.listPredictions(user.tenant_id, {
        entity_type: url.searchParams.get('entity_type'),
        status: url.searchParams.get('status'),
        min_risk: parseFloat(url.searchParams.get('min_risk') || '0'),
        limit: parseInt(url.searchParams.get('limit') || '100')
      }) });
    }
    if (pathname.startsWith('/api/failure-prediction/predictions/') && req.method === 'GET') {
      const id = pathname.split('/')[4];
      return json(res, { success: true, prediction: failurePredictionService.getPrediction(user.tenant_id, id) });
    }
    if (pathname.startsWith('/api/failure-prediction/predictions/') && req.method === 'PATCH') {
      const id = pathname.split('/')[4];
      const ok = failurePredictionService.updatePrediction(user.tenant_id, id, body);
      return json(res, { success: ok, prediction: ok ? failurePredictionService.getPrediction(user.tenant_id, id) : null });
    }

    // ReBAC / Zanzibar-lite Authorization
    if (pathname === '/api/authz/tuples' && req.method === 'POST') {
      const tuple = authorizationService.write(user.tenant_id, body);
      return json(res, { success: true, tuple });
    }
    if (pathname === '/api/authz/tuples' && req.method === 'DELETE') {
      const ok = authorizationService.deleteTuple(user.tenant_id, body);
      return json(res, { success: ok });
    }
    if (pathname === '/api/authz/tuples' && req.method === 'GET') {
      return json(res, { success: true, tuples: authorizationService.list(user.tenant_id, {
        object_type: url.searchParams.get('object_type'),
        object_id: url.searchParams.get('object_id'),
        relation: url.searchParams.get('relation'),
        user_id: url.searchParams.get('user_id'),
        limit: parseInt(url.searchParams.get('limit') || '100')
      }) });
    }
    if (pathname === '/api/authz/check' && req.method === 'POST') {
      const result = authorizationService.check(user.tenant_id, body);
      return json(res, { success: true, ...result });
    }
    if (pathname === '/api/authz/snapshot' && req.method === 'POST') {
      const result = authorizationService.snapshot(user.tenant_id, body.object_type, body.object_id);
      return json(res, { success: true, ...result });
    }
    if (pathname === '/api/authz/expand' && req.method === 'GET') {
      return json(res, { success: true, tuples: authorizationService.expand(user.tenant_id, {
        object_type: url.searchParams.get('object_type'),
        object_id: url.searchParams.get('object_id'),
        relation: url.searchParams.get('relation')
      }) });
    }

    // ===== MCP 1.0 Streamable-HTTP Transport (spec 2025-11-25) =====
    // POST /mcp — JSON-RPC 2.0 over HTTP (with optional SSE streaming for long responses)
    if (pathname === '/mcp' && req.method === 'POST') {
      const accept = String(req.headers['accept'] || '');
      const sessionId = req.headers['mcp-session-id'] || null;
      const isStream = accept.includes('text/event-stream');
      const ctx = { tenant_id: user.tenant_id, user_id: user.id };
      const bodies = Array.isArray(body) ? body : [body];
      // Pre-compute responses so we can write headers correctly in one pass
      const responses = [];
      let newSessionId = null;
      for (const singleBody of bodies) {
        if (sessionId) mcpStreamableHttp.touchSession(sessionId);
        const r = await mcpStreamableHttp.handleJsonRpc(singleBody, ctx);
        responses.push(r);
        if (singleBody && singleBody.method === 'initialize' && r && r.result && r.result.sessionId) {
          newSessionId = r.result.sessionId;
        }
      }
      const headerSessionId = newSessionId || sessionId || '';
      if (isStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Mcp-Session-Id': headerSessionId
        });
        for (const r of responses) {
          try { res.write(`data: ${JSON.stringify(r)}\n\n`); } catch {}
        }
        try { res.end(); } catch {}
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': headerSessionId });
        const bodyOut = bodies.length === 1 ? responses[0] : responses;
        try { res.end(JSON.stringify(bodyOut)); } catch {}
      }
      return;
    }
    // GET /mcp — open SSE stream for server-initiated messages
    if (pathname === '/mcp' && req.method === 'GET') {
      const sessionId = req.headers['mcp-session-id'] || '';
      if (!sessionId || !mcpStreamableHttp.getSession(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Missing or invalid Mcp-Session-Id' } }));
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Mcp-Session-Id': sessionId
      });
      // Keep-alive ping every 15s; close on req close
      const ping = setInterval(() => {
        try { res.write(`: keep-alive ${Date.now()}\n\n`); mcpStreamableHttp.touchSession(sessionId); } catch { clearInterval(ping); }
      }, 15000);
      // Initial event
      try { res.write(`event: ready\ndata: ${JSON.stringify({ sessionId, ts: new Date().toISOString() })}\n\n`); } catch {}
      req.on('close', () => { clearInterval(ping); try { res.end(); } catch {} });
      return;
    }
    // DELETE /mcp — terminate session
    if (pathname === '/mcp' && req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'] || '';
      const removed = sessionId ? mcpStreamableHttp.deleteSession(sessionId) : false;
      return json(res, { jsonrpc: '2.0', result: { terminated: removed } });
    }
    // GET /mcp/info — public discovery (no auth) for client config
    if (pathname === '/mcp/info' && req.method === 'GET') {
      return json(res, {
        protocolVersion: mcpStreamableHttp.MCP_VERSION,
        serverInfo: mcpStreamableHttp.buildServerInfo(),
        capabilities: mcpStreamableHttp.buildCapabilities(),
        transport: 'streamable-http',
        endpoint: '/mcp',
        methods: ['initialize', 'ping', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', 'prompts/get', 'notifications/initialized']
      });
    }

    // ===== Embeddings + HNSW (v2.6.12) =====
    if (pathname === '/api/embeddings' && req.method === 'POST') {
      const { source, source_id, text, model } = body || {};
      if (!source || !text) return json(res, { success: false, error: 'source y text requeridos' }, 400);
      const r = embeddingService.upsert(user.tenant_id, { source, sourceId: source_id, text, model });
      return json(res, { success: true, embedding: r });
    }
    if (pathname === '/api/embeddings/search' && req.method === 'POST') {
      const { query, k = 5, source = null, threshold = 0 } = body || {};
      if (!query) return json(res, { success: false, error: 'query requerida' }, 400);
      const results = embeddingService.search(user.tenant_id, { query, k, source, threshold });
      return json(res, { success: true, results, count: results.length });
    }
    if (pathname === '/api/embeddings/hnsw' && req.method === 'POST') {
      const { query, k = 5, ef = 50, source = null, threshold = 0 } = body || {};
      if (!query) return json(res, { success: false, error: 'query requerida' }, 400);
      const results = embeddingService.hnswSearch(user.tenant_id, { query, k, ef, source, threshold });
      return json(res, { success: true, results, count: results.length, algorithm: 'hnsw' });
    }
    if (pathname === '/api/embeddings/hybrid' && req.method === 'POST') {
      const { query, k = 5, source = null, alpha = 0.7 } = body || {};
      if (!query) return json(res, { success: false, error: 'query requerida' }, 400);
      const results = embeddingService.hybridSearch(user.tenant_id, { query, k, source, alpha });
      return json(res, { success: true, results, count: results.length });
    }
    if (pathname === '/api/embeddings/stats' && req.method === 'GET') {
      return json(res, { success: true, stats: embeddingService.stats(user.tenant_id) });
    }
    if (pathname.startsWith('/api/embeddings/') && req.method === 'DELETE') {
      const params = new URL(req.url, 'http://x').searchParams;
      const source = params.get('source');
      const sourceId = params.get('source_id');
      const removed = embeddingService.delete(user.tenant_id, { source, sourceId });
      return json(res, { success: true, removed });
    }

    return json(res, { success: false, error: 'Not found' }, 404);
  } catch (e) {
    if (e.message && e.message.includes('Payload exceeds')) {
      return json(res, { success: false, error: 'Payload too large' }, 413);
    }
    console.error(e);
    const detail = NODE_ENV === 'production' ? undefined : e.message;
    return json(res, { success: false, error: 'Server error', detail }, 500);
  }
});

const chat = new ChatService(server);
const telemetry = new TelemetryService(server);
workerService.start(); // start background event workers

function shutdown(signal) {
  console.log(`Received ${signal}. Closing connections...`);
  workerService.stop();
  chat?.stop?.();
  telemetry?.stop?.();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => console.log(`AzurDesk AI v2.6.13 running on http://localhost:${PORT}`));
export { db, chat, telemetry };
