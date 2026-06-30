import http from 'http';

const opts = { hostname: 'localhost', port: process.env.PORT || 5200 };
const PORT = opts.port;

function request(method, path, body, token, expectJson = true) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request({ hostname: opts.hostname, port: opts.port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: expectJson ? JSON.parse(data) : data }); } catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  let token;
  {
    const r = await request('POST', '/api/auth/login', { email: 'admin@azurdesk.ai', password: 'admin123' }, null, true);
    if (r.status !== 200 || !r.body.token) { console.error('login failed', r); process.exit(1); }
    token = r.body.token;
  }
  const checks = [];
  function add(name, ok) { checks.push({ name, ok }); }

  add('GET /api/health', (await request('GET', '/api/health', null, token)).body.success === true);
  add('GET / index.html', (await request('GET', '/', null, null, false)).status === 200);
  add('POST /api/sites', (await request('POST', '/api/sites', { name: 'Test', domain: 'test.page' }, token)).status === 200);
  add('POST /api/tickets', (await request('POST', '/api/tickets', { requester_email: 'a@b.com', requester_name: 'A', subject: 'Test', body: 'Body largo del ticket' }, token)).status === 200);
  add('GET /api/helpdesk/metrics', (await request('GET', '/api/helpdesk/metrics', null, token)).status === 200);
  add('POST /api/ai/reply', (await request('POST', '/api/ai/reply', { subject: 'Problema', body: 'No puedo acceder', category: 'general', priority: 'media', level: 1 }, token)).status === 200);
  add('GET /api/users', (await request('GET', '/api/users', null, token)).status === 200);
  add('GET /api/llm/stats', (await request('GET', '/api/llm/stats', null, token)).status === 200);
  add('POST /api/agents', (await request('POST', '/api/agents', { name: 'TestAgent', capabilities: ['diagnose'], config: { role: 'technician' } }, token)).status === 200);
  add('GET /api/helpdesk/kanban', (await request('GET', '/api/helpdesk/kanban', null, token)).status === 200);
  add('GET /api/agents', (await request('GET', '/api/agents', null, token)).status === 200);
  add('GET /api/agents/metrics', (await request('GET', '/api/agents/metrics', null, token)).status === 200);
  add('GET /api/agents/health', (await request('GET', '/api/agents/health', null, token)).status === 200);
  add('GET /api/agents/rebalance/recommend', (await request('GET', '/api/agents/rebalance/recommend', null, token)).status === 200);
  add('GET /api/swarm/status', (await request('GET', '/api/swarm/status', null, token)).status === 200);
  add('POST /api/swarm/messages', (await request('POST', '/api/swarm/messages', { from_agent: 'a1', to_agent: 'a2', channel: 'general', body: 'hola' }, token)).status === 200);
  add('GET /api/memory/graph', (await request('GET', '/api/memory/graph', null, token)).status === 200);
  add('POST /api/kb/graph', (await request('POST', '/api/kb/graph', { article_id: 'g1', title: 'Resetear contraseña', content: 'Para restablecer contraseña de Windows contacta a TI.', tags: 'password' }, token)).status === 200);
  add('POST /api/ai/rag', (await request('POST', '/api/ai/rag', { query: 'contraseña olvidada' }, token)).status === 200);
  add('POST /api/memory', (await request('POST', '/api/memory', { content: 'Usuario habla español' }, token)).status === 200);
  add('POST /api/tokenizer/train', (await request('POST', '/api/tokenizer/train', { texts: ['soporte TI', 'tickets urgentes', 'SLA vencido'], vocab_size: 100 }, token)).status === 200);
  add('POST /api/tokenizer/encode', (await request('POST', '/api/tokenizer/encode', { text: 'soporte TI' }, token)).status === 200);
  add('POST /api/orchestrator/runs', (await request('POST', '/api/orchestrator/runs', { goal: 'Integrar pagos' }, token)).status === 200);
  add('POST /api/review', (await request('POST', '/api/review', { code: 'const x=1;' }, token)).status === 200);
  add('GET /api/obsidian/notes', (await request('GET', '/api/obsidian/notes?folder=AzurDesk', null, token)).status === 200);
  add('GET /api/documents', (await request('GET', '/api/documents', null, token)).status === 200);
  add('GET /api/automaton/rules', (await request('GET', '/api/automaton/rules', null, token)).status === 200);
  add('POST /api/automaton/rules', (await request('POST', '/api/automaton/rules', { name: 'smoke', description: 'smoke', condition: { priority: 'critica' }, actions: [{ type: 'webhook', params: { url: 'http://localhost/smoke', message: 'x' } }], priority: 1, enabled: true }, token)).status === 200);
  add('POST /api/mesh/nodes', (await request('POST', '/api/mesh/nodes', { agent_id: 'smoke-mesh', name: 'Smoke Mesh', role: 'specialist', level: 3, skills: ['network'] }, token)).status === 200);
  add('GET /api/mesh/nodes', (await request('GET', '/api/mesh/nodes', null, token)).status === 200);
  const legalResp = await request('POST', '/api/legal/cases', {
    title: 'Contrato de servicios', summary: 'Revisión de SLA y confidencialidad', type: 'contract',
    requester_email: 'legal@corp.com', requester_name: 'Legal'
  }, token);
  add('POST /api/legal/cases', legalResp.status === 200);
  const createdLegalId = legalResp.body?.case?.id;
  add('GET /api/legal/cases', (await request('GET', '/api/legal/cases?type=contract', null, token)).status === 200);
  add('GET /api/legal/cases/:id', (await request('GET', `/api/legal/cases/${createdLegalId}`, null, token)).status === 200);
  const contractReview = await request('POST', '/api/legal/contracts/reviews', {
    case_id: createdLegalId,
    title: 'Smoke contrato',
    text: 'El proveedor indemniza al cliente por cualquier daño y se obliga a mantenerlo indemne. El cliente puede rescindir sin previo aviso. La propiedad intelectual generada pertenecerá en forma absoluta al cliente.'
  }, token);
  add('POST /api/legal/contracts/reviews', contractReview.status === 200 && contractReview.body?.review?.overall_score > 0);
  const contractReviewId = contractReview.body?.review?.id;
  add('GET /api/legal/contracts/reviews', (await request('GET', `/api/legal/contracts/reviews?case_id=${createdLegalId}`, null, token)).status === 200);
  add('GET /api/legal/contracts/reviews/:id', (await request('GET', `/api/legal/contracts/reviews/${contractReviewId}`, null, token)).status === 200);
  add('GET /api/aaas/providers', (await request('GET', '/api/aaas/providers', null, token)).status === 200);
  add('GET /api/aaas/models', (await request('GET', '/api/aaas/models', null, token)).status === 200);
  add('POST /api/aaas/generate no providers', (await request('POST', '/api/aaas/generate', { prompt: 'hola' }, token)).status === 502);
  add('GET /api/aaas/usage', (await request('GET', '/api/aaas/usage', null, token)).status === 200);
  add('POST /api/marketing/campaigns', (await request('POST', '/api/marketing/campaigns', { name: 'Smoke Campaign', goal: 'leads' }, token)).status === 200);
  add('GET /api/marketing/campaigns', (await request('GET', '/api/marketing/campaigns', null, token)).status === 200);
  add('GET /api/marketing/assets', (await request('GET', '/api/marketing/assets', null, token)).status === 200);
  add('GET /api/radar', (await request('GET', '/api/radar', null, token)).body.success === true);

  add('POST /api/api-keys', (await request('POST', '/api/api-keys', { name: 'Smoke Key', scopes: ['read'] }, token)).status === 200);
  add('GET /api/api-keys', (await request('GET', '/api/api-keys', null, token)).status === 200);
  add('GET /api/audit/logs', (await request('GET', '/api/audit/logs', null, token)).status === 200);
  add('GET /api/quota', (await request('GET', '/api/quota', null, token)).status === 200);
  add('PUT /api/quota', (await request('PUT', '/api/quota', { max_llm_calls_per_day: 2000 }, token)).status === 200);
  add('GET /api/docs', (await request('GET', '/api/docs', null, token)).body.openapi !== undefined);

  add('POST /api/prompts', (await request('POST', '/api/prompts', { name: 'Test Template', category: 'test', system_prompt: 'You are helpful', user_template: 'Hello {{name}}', variables: ['name'] }, token)).status === 200);
  add('GET /api/prompts', (await request('GET', '/api/prompts', null, token)).status === 200);
  add('GET /api/notifications', (await request('GET', '/api/notifications', null, token)).status === 200);
  add('GET /api/notifications/unread-count', (await request('GET', '/api/notifications/unread-count', null, token)).status === 200);
  add('GET /api/webhooks/deliveries', (await request('GET', '/api/webhooks/deliveries', null, token)).status === 200);

  // AAAS platform endpoints
  add('GET /api/plans', (await request('GET', '/api/plans', null, null)).status === 200);
  add('POST /api/workflows', (await request('POST', '/api/workflows', { name: 'Test WF', nodes: [{ id: 'n1', type: 'prompt', config: { template: 'Hello {{name}}' } }, { id: 'n2', type: 'output', config: { input_node: 'n1' } }], edges: [{ source: 'n1', target: 'n2' }] }, token)).status === 200);
  add('GET /api/workflows', (await request('GET', '/api/workflows', null, token)).status === 200);
  add('GET /api/tenant', (await request('GET', '/api/tenant', null, token)).status === 200);
  add('POST /api/tenant/upgrade', (await request('POST', '/api/tenant/upgrade', { plan: 'starter' }, token)).status === 200);

  // Final innovations
  add('GET /api/analytics/summary', (await request('GET', '/api/analytics/summary', null, token)).status === 200);
  add('GET /api/analytics/rankings', (await request('GET', '/api/analytics/rankings', null, token)).status === 200);
  add('GET /api/analytics/top-models', (await request('GET', '/api/analytics/top-models', null, token)).status === 200);
  add('GET /api/rbac/me', (await request('GET', '/api/rbac/me', null, token)).status === 200);
  add('POST /api/rbac/check', (await request('POST', '/api/rbac/check', { resource: 'tickets', action: 'read' }, token)).status === 200);
  add('GET /api/assets', (await request('GET', '/api/assets', null, token)).status === 200);
  add('GET /api/docs (OpenAPI)', (await request('GET', '/api/docs', null, token)).status === 200);
  add('POST /api/mcp (tools/list)', (await request('POST', '/api/mcp', { method: 'tools/list', id: 1 }, token)).status === 200);

  // Ciclo 2 innovations
  add('POST /api/a2a/cards', (await request('POST', '/api/a2a/cards', { from_agent: 'alice', to_tenant: 'ext', to_agent: 'bob', task_type: 'delegate', payload: { x: 1 } }, token)).status === 200);
  add('GET /api/a2a/inbox', (await request('GET', '/api/a2a/inbox?agent_id=bob', null, token)).status === 200);
  add('POST /api/local-llm/models', (await request('POST', '/api/local-llm/models', { name: 'qwen', backend: 'llama.cpp', path: 'models/qwen.gguf', context_size: 8192 }, token)).status === 200);
  add('POST /api/local-llm/route', (await request('POST', '/api/local-llm/route', { text: 'hola' }, token)).status === 200);
  add('POST /api/otel/traces', (await request('POST', '/api/otel/traces', { trace_id: 'trace-smoke', span_id: 'span-smoke', service: 'aaas-router', operation: 'generate' }, token)).status === 200);
  add('POST /api/self-heal', (await request('POST', '/api/self-heal', {}, token)).status === 200);
  add('GET /api/queue/durable-workflows', (await request('GET', '/api/queue/durable-workflows', null, token)).status === 200);

  // AaaS Gateway
  add('POST /api/agents/bootstrap', (await request('POST', '/api/agents/bootstrap', {}, token)).status === 200);
  add('GET /api/agents', (await request('GET', '/api/agents', null, token)).status === 200);
  add('GET /api/agents/intents', (await request('GET', '/api/agents/intents', null, token)).status === 200);
  add('POST /api/agents/invoke (ticket.create)', (await request('POST', '/api/agents/invoke', { intent: 'ticket.create', payload: { requester_email: 'a@b.com', requester_name: 'A', subject: 'Smoke', body: 'x' } }, token)).status === 200);

  // Obsidian, AI Notes, Meetings
  add('GET /api/obsidian/folders', (await request('GET', '/api/obsidian/folders', null, token)).status === 200);
  add('GET /api/obsidian/notes', (await request('GET', '/api/obsidian/notes?folder=AzurDesk', null, token)).status === 200);
  add('GET /api/obsidian/search', (await request('GET', '/api/obsidian/search?q=test', null, token)).status === 200);
  add('POST /api/notes/generate (ticket)', (await request('POST', '/api/notes/generate', { entity_type: 'ticket', entity: { id: 'TK-1', subject: 'Test', body: 'Body', priority: 'media', status: 'open', created_at: new Date().toISOString() } }, token)).status === 200);
  add('POST /api/notes/generate (analytics)', (await request('POST', '/api/notes/generate', { entity_type: 'analytics', entity: { period: '24h', total_calls: 1, total_cost: 0.001, avg_latency_ms: 100 } }, token)).status === 200);
  add('POST /api/meetings/process', (await request('POST', '/api/meetings/process', { title: 'Daily', summary: 'Juan revisará el ticket VPN-42 para mañana. María actualizará la documentación.' }, token)).status === 200);

  // v2.3.0 AaaS Unified
  add('POST /api/memory/remember', (await request('POST', '/api/memory/remember', { user_id: 'u-smoke', content: 'preferencia español', type: 'semantic' }, token)).status === 200);
  add('POST /api/memory/recall', (await request('POST', '/api/memory/recall', { user_id: 'u-smoke', query: 'idioma preferido' }, token)).status === 200);
  add('POST /api/search/hybrid', (await request('POST', '/api/search/hybrid', { user_id: 'u-smoke', query: 'español' }, token)).status === 200);
  add('POST /api/tickets/predict', (await request('POST', '/api/tickets/predict', { samples: [{ text: 'forgot password', label: 1 }], text: 'forgot password' }, token)).status === 200);
  add('POST /api/agents/act', (await request('POST', '/api/agents/act', { agent_id: 'a-smoke', task: 'captura' }, token)).status === 200);

  // Guardrails, Tracing, Handoffs, Durable Workflows, Harness, Cost Router
  add('POST /api/guardrails/rules', (await request('POST', '/api/guardrails/rules', { name: 'test', scope: 'output', pattern: 'test123', action: 'block', message: 'test' }, token)).status === 200);
  add('GET /api/guardrails/rules', (await request('GET', '/api/guardrails/rules', null, token)).status === 200);
  add('POST /api/guardrails/check', (await request('POST', '/api/guardrails/check', { scope: 'output', text: 'safe' }, token)).status === 200);
  add('POST /api/handoffs', (await request('POST', '/api/handoffs', { ticket_id: 't-' + Date.now(), from_agent: 'a1', from_level: 1, to_level: 2, reason: 'escalation' }, token)).status === 200);
  add('POST /api/workflows/durable', (await request('POST', '/api/workflows/durable', { name: 'smoke', steps: ['a', 'b'], max_retries: 1, compensation: ['rollback'] }, token)).status === 200);
  add('GET /api/workflows/durable', (await request('GET', '/api/workflows/durable', null, token)).status === 200);
  add('POST /api/agent-harness/skills', (await request('POST', '/api/agent-harness/skills', { agent_id: 'a1', name: 'smoke-skill', description: 'x', params: [] }, token)).status === 200);
  add('POST /api/agent-harness/schedules', (await request('POST', '/api/agent-harness/schedules', { agent_id: 'a1', name: 'smoke-sched', cron: '0 9 * * *', goal: 'check' }, token)).status === 200);
  add('POST /api/agent-harness/sandbox', (await request('POST', '/api/agent-harness/sandbox', { agent_id: 'a1', command: 'echo ok', timeoutMs: 3000 }, token)).status === 200);
  add('POST /api/cost-router', (await request('POST', '/api/cost-router', { text: 'hola' }, token)).status === 200);

  // Ciclo 3: A2A Standard, Agent DAG, Browser Agent, MCP Registry, Billing
  add('POST /api/a2a/tasks', (await request('POST', '/api/a2a/tasks', { sender: 'smoke-a', receiver: 'smoke-b', payload: { intent: 'ticket.create' } }, token)).status === 200);
  add('GET /api/a2a/tasks', (await request('GET', '/api/a2a/tasks', null, token)).status === 200);
  add('POST /api/agents/dag', (await request('POST', '/api/agents/dag', { intent: 'dag.smoke', plan: [{ id: '1', intent: 'ticket.create', payload: { requester_email: 'a@b.com', requester_name: 'A', subject: 'DAG smoke', body: 'x' }, deps: [] }] }, token)).status === 200);
  add('POST /api/browser/navigate', (await request('POST', '/api/browser/navigate', { url: 'https://example.com' }, token)).status === 200);
  add('POST /api/browser/extract', (await request('POST', '/api/browser/extract', { selector: 'h1' }, token)).status === 200);
  add('GET /api/mcp/registry', (await request('GET', '/api/mcp/registry', null, token)).status === 200);
  add('GET /api/mcp/registry/installed', (await request('GET', '/api/mcp/registry/installed', null, token)).status === 200);
  add('GET /api/billing/usage', (await request('GET', '/api/billing/usage', null, token)).status === 200);
  add('GET /api/billing/invoice', (await request('GET', '/api/billing/invoice', null, token)).status === 200);

  // Ciclo 4 smoke
  add('GET /api/workforce/assignments', (await request('GET', '/api/workforce/assignments', null, token)).status === 200);
  add('POST /api/workforce/schedule', (await request('POST', '/api/workforce/schedule', { task_type: 'triage', required_skills: [], payload: {} }, token)).status === 200);
  add('POST /api/rag/agentic', (await request('POST', '/api/rag/agentic', { query: 'password reset' }, token)).status === 200);
  add('POST /api/abac/policies', (await request('POST', '/api/abac/policies', { name: 'admin', resource: 'billing', action: 'read', conditions: { 'subject.role': 'admin' } }, token)).status === 200);
  add('GET /api/abac/policies', (await request('GET', '/api/abac/policies', null, token)).status === 200);
  add('POST /api/abac/evaluate', (await request('POST', '/api/abac/evaluate', { subject: { role: 'admin' }, resource: 'billing', action: 'read' }, token)).status === 200);
  add('POST /api/agent-eval/cases', (await request('POST', '/api/agent-eval/cases', { intent: 'memory.remember', payload: {}, expected_keys: ['id'] }, token)).status === 200);
  add('GET /api/agent-eval/cases', (await request('GET', '/api/agent-eval/cases', null, token)).status === 200);
  add('POST /api/mesh/heartbeat', (await request('POST', '/api/mesh/heartbeat', { agent_id: 'm-smoke', name: 'Smoke', role: 'worker', level: 1, skills: ['a'], endpoint: 'http://m' }, token)).status === 200);
  add('GET /api/mesh/active', (await request('GET', '/api/mesh/active', null, token)).status === 200);
  add('GET /api/sessions/stalled', (await request('GET', '/api/sessions/stalled', null, token)).status === 200);
  add('POST /api/sessions/sweep', (await request('POST', '/api/sessions/sweep', {}, token)).status === 200);

  add('POST /api/sandboxes/executions', (await request('GET', '/api/sandboxes/executions', null, token)).status === 200);
  add('POST /api/causal-alerts/ingest', (await request('POST', '/api/causal-alerts/ingest', { metric: 'cpu', source: 'smoke', value: 35 }, token)).status === 200);
  add('GET /api/causal-alerts', (await request('GET', '/api/causal-alerts', null, token)).status === 200);
  add('POST /api/remediation/rules', (await request('POST', '/api/remediation/rules', { name: 'Smoke Remediation', trigger: 'cpu.spike', condition: { severity: 'critical' }, actions: [{ type: 'noop', args: {} }], enabled: true }, token)).status === 200);
  add('GET /api/remediation/rules', (await request('GET', '/api/remediation/rules', null, token)).status === 200);
  add('POST /api/costs/charges', (await request('POST', '/api/costs/charges', { resource: 'agent.invoke', agent_id: 'smoke', metric: 'agent.invocation', quantity: 10 }, token)).status === 200);
  add('GET /api/costs/totals', (await request('GET', '/api/costs/totals', null, token)).status === 200);

  // Durable Execution Engine
  const execRes = await request('POST', '/api/executions', { name: 'smoke-durable', context: { order: 'ORD-1' }, max_attempts: 2 }, token);
  add('POST /api/executions', execRes.status === 200);
  if (execRes.body.execution?.id) {
    const execId = execRes.body.execution.id;
    add('GET /api/executions', (await request('GET', '/api/executions', null, token)).status === 200);
    add('GET /api/executions/:id', (await request('GET', `/api/executions/${execId}`, null, token)).status === 200);
    add('POST /api/executions/:id/events', (await request('POST', `/api/executions/${execId}/events`, { type: 'smoke-step', payload: { ok: true } }, token)).status === 200);
    add('GET /api/executions/:id/events', (await request('GET', `/api/executions/${execId}/events`, null, token)).status === 200);
    add('POST /api/executions/:id/complete', (await request('POST', `/api/executions/${execId}/complete`, { result: { status: 'done' } }, token)).status === 200);
  }

  // MCP Gateway
  const mcpGwTool = await request('POST', '/api/mcp/gateway/tools', { server_id: 'github', tool_name: 'smoke_tool', rate_limit_rpm: 60, cost_per_call: 0.01 }, token);
  add('POST /api/mcp/gateway/tools', mcpGwTool.status === 200);
  if (mcpGwTool.body.tool?.id) {
    const toolId = mcpGwTool.body.tool.id;
    add('GET /api/mcp/gateway/tools', (await request('GET', '/api/mcp/gateway/tools', null, token)).status === 200);
    add('POST /api/mcp/gateway/call', (await request('POST', '/api/mcp/gateway/call', { tool_id: toolId, input: { x: 1 } }, token)).status === 200);
    add('GET /api/mcp/gateway/calls', (await request('GET', `/api/mcp/gateway/calls?tool_id=${toolId}`, null, token)).status === 200);
    add('GET /api/mcp/gateway/totals', (await request('GET', '/api/mcp/gateway/totals', null, token)).status === 200);
  }

  // Failure Prediction
  add('POST /api/failure-prediction/signals', (await request('POST', '/api/failure-prediction/signals', { signal_type: 'error_rate', entity_type: 'service', entity_id: 'smoke-svc', value: 0.8, threshold: 0.7 }, token)).status === 200);
  add('POST /api/failure-prediction/predict', (await request('POST', '/api/failure-prediction/predict', { entity_type: 'service', entity_id: 'smoke-svc', signals: [{ signal_type: 'error_rate', value: 0.9, threshold: 0.7 }] }, token)).status === 200);
  const fpScan = await request('POST', '/api/failure-prediction/scan', {}, token);
  add('POST /api/failure-prediction/scan', fpScan.status === 200);
  if (fpScan.body.prediction?.id) {
    const fpId = fpScan.body.prediction.id;
    add('GET /api/failure-prediction/predictions', (await request('GET', '/api/failure-prediction/predictions', null, token)).status === 200);
    add('GET /api/failure-prediction/predictions/:id', (await request('GET', `/api/failure-prediction/predictions/${fpId}`, null, token)).status === 200);
    add('PATCH /api/failure-prediction/predictions/:id', (await request('PATCH', `/api/failure-prediction/predictions/${fpId}`, { status: 'resolved' }, token)).status === 200);
  }

  // ReBAC Authorization
  add('POST /api/authz/tuples', (await request('POST', '/api/authz/tuples', { object_type: 'document', object_id: 'smoke-doc', relation: 'viewer', user_type: 'user', user_id: 'u-smoke' }, token)).status === 200);
  add('POST /api/authz/check allow', (await request('POST', '/api/authz/check', { object_type: 'document', object_id: 'smoke-doc', relation: 'viewer', user_type: 'user', user_id: 'u-smoke' }, token)).body.allowed === true);
  add('POST /api/authz/check deny', (await request('POST', '/api/authz/check', { object_type: 'document', object_id: 'smoke-doc', relation: 'editor', user_type: 'user', user_id: 'u-other' }, token)).body.allowed === false);
  add('GET /api/authz/tuples', (await request('GET', '/api/authz/tuples?object_type=document', null, token)).status === 200);
  add('POST /api/authz/snapshot', (await request('POST', '/api/authz/snapshot', { object_type: 'document', object_id: 'smoke-doc' }, token)).status === 200);

  // Conductor-lite
  const conductorWf = await request('POST', '/api/conductor/workflows', {
    name: 'smoke-approval',
    dag: {
      steps: [
        { seq: 1, id: 'request', type: 'action', deps: [], handler: 'noop' },
        { seq: 2, id: 'approve', type: 'action', deps: ['request'], handler: 'noop' },
        { seq: 3, id: 'notify', type: 'action', deps: ['approve'], handler: 'noop' }
      ]
    },
    compensation: [{ seq: 1, id: 'rollback', type: 'action', handler: 'noop' }]
  }, token);
  add('POST /api/conductor/workflows', conductorWf.status === 200);
  if (conductorWf.body.workflow?.id) {
    const wfId = conductorWf.body.workflow.id;
    add('GET /api/conductor/workflows', (await request('GET', '/api/conductor/workflows', null, token)).status === 200);
    add('GET /api/conductor/workflows/:id', (await request('GET', `/api/conductor/workflows/${wfId}`, null, token)).status === 200);
    const runRes = await request('POST', '/api/conductor/runs', { workflow_id: wfId, context: { requester: 'smoke' } }, token);
    add('POST /api/conductor/runs', runRes.status === 200);
    if (runRes.body.run?.runId) {
      const runId = runRes.body.run.runId;
      add('GET /api/conductor/runs', (await request('GET', '/api/conductor/runs', null, token)).status === 200);
      add('GET /api/conductor/runs/:id', (await request('GET', `/api/conductor/runs/${runId}`, null, token)).status === 200);
    }
  }

  // v2.6.9 — Prompt cache endpoints
  const cacheStatsRes = await request('GET', '/api/llm/cache/stats?days=7', null, token);
  add('GET /api/llm/cache/stats', cacheStatsRes.status === 200 && cacheStatsRes.body.totals !== undefined);
  const cacheInvRes = await request('POST', '/api/llm/cache/invalidate', { modelProvider: 'noop', modelName: 'noop' }, token);
  add('POST /api/llm/cache/invalidate', cacheInvRes.status === 200 && typeof cacheInvRes.body.removed === 'number');
  const cacheCleanRes = await request('POST', '/api/llm/cache/cleanup', {}, token);
  add('POST /api/llm/cache/cleanup', cacheCleanRes.status === 200 && typeof cacheCleanRes.body.removed === 'number');
  // /api/llm/generate with useCache=false (we don't depend on real LLM)
  const genRes = await request('POST', '/api/llm/generate', { prompt: 'ping', useCache: false, reasoning: 'low' }, token);
  add('POST /api/llm/generate (useCache=false, reasoning=low)', genRes.status === 200 && genRes.body.reasoning === 'low');

  // v2.6.9 — A2A streaming NDJSON
  const streamRes = await new Promise((resolve) => {
    const url = `http://127.0.0.1:${PORT}/api/a2a/stream?agent_id=smoke&interval_ms=600&max_batches=2`;
    const req = http.request(url, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }, (r) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (c) => { data += c; });
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: String(e) }));
    req.end();
  });
  const streamLines = streamRes.body.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  add('GET /api/a2a/stream (NDJSON)', streamRes.status === 200 && streamLines.length >= 3 && streamLines[0].event === 'open');

  console.log('SMOKE AzurDesk AI v2.6.7 AaaS+SaaS + Innovaciones 2026');
  for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name} ${!c.ok ? '(falló)' : ''}`);
  const ok = checks.filter((c) => c.ok).length;
  console.log(`\nSMOKE: ${ok}/${checks.length} pasaron`);
  process.exit(ok === checks.length ? 0 : 1);
}

main();
