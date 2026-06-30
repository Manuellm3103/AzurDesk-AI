import http from 'http';

const base = { hostname: 'localhost', port: process.env.PORT || 5200 };

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request({ ...base, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const CASES = [
  // Helpdesk real-world
  { method: 'POST', path: '/api/tickets', name: 'Ticket: reporte de caída de red', body: { requester_email: 'ana@cliente.com', requester_name: 'Ana', subject: 'Caída de red en sucursal norte', body: 'No hay internet desde hace 30 minutos. Urgente.', category: 'network', priority: 'critica' } },
  { method: 'POST', path: '/api/tickets', name: 'Ticket: solicitud de acceso VPN', body: { requester_email: 'luis@cliente.com', requester_name: 'Luis', subject: 'Necesito VPN para home office', body: 'Solicito acceso VPN temporal por 1 semana.', category: 'access', priority: 'normal' } },
  { method: 'GET', path: '/api/tickets', name: 'Listar tickets del tenant' },
  { method: 'POST', path: '/api/kb/articles', name: 'KB: artículo password reset', body: { title: 'Cómo resetear contraseña', content: 'Ir al portal y hacer clic en olvidé mi contraseña.', tags: ['password','onboarding'] } },
  { method: 'GET', path: '/api/kb/search?q=password', name: 'Buscar KB password' },
  // Auth y tenants
  { method: 'POST', path: '/api/auth/login', noToken: true, name: 'Login admin correcto', body: { email: 'admin@azurdesk.ai', password: 'admin123' } },
  { method: 'POST', path: '/api/auth/login', noToken: true, name: 'Login credenciales inválidas', body: { email: 'admin@azurdesk.ai', password: 'wrong' }, expectStatus: 401 },
  // AAAS Gateway real intents
  { method: 'POST', path: '/api/agents/invoke', name: 'Gateway: ticket.create', body: { intent: 'ticket.create', payload: { requester_email: 'gateway@t.com', requester_name: 'Gateway', subject: 'Test gateway', body: 'x' } } },
  { method: 'POST', path: '/api/agents/invoke', name: 'Gateway: memory.remember', body: { intent: 'memory.remember', payload: { user_id: 'u1', content: 'cliente prefiere español' } } },
  { method: 'POST', path: '/api/agents/invoke', name: 'Gateway: memory.recall', body: { intent: 'memory.recall', payload: { user_id: 'u1', query: 'español' } } },
  { method: 'POST', path: '/api/agents/invoke', name: 'Gateway: kb.search', body: { intent: 'kb.search', payload: { query: 'password' } } },
  { method: 'POST', path: '/api/agents/invoke', name: 'Gateway: workflow.run', body: { intent: 'workflow.run', payload: { workflow_id: 'wf-onboarding' } } },
  // Ciclo 3 real
  { method: 'POST', path: '/api/a2a/tasks', name: 'A2A: crear tarea estándar', body: { task_type: 'research', payload: { topic: 'mejores prácticas backup' }, callback_url: 'http://localhost/cb' } },
  { method: 'GET', path: '/api/a2a/tasks', name: 'A2A: listar tareas' },
  { method: 'POST', path: '/api/agents/dag', name: 'DAG: ejecutar flujo', body: { intent: 'resolve_ticket', payload: { ticket_id: 't-123' } } },
  { method: 'GET', path: '/api/mcp/registry?q=filesystem', name: 'MCP Registry buscar filesystem' },
  { method: 'POST', path: '/api/browser/navigate', name: 'Browser Agent navigate stub', body: { url: 'https://example.com' } },
  { method: 'GET', path: '/api/billing/usage', name: 'Billing usage del tenant' },
  { method: 'GET', path: '/api/billing/invoice', name: 'Billing invoice del tenant' },
  // Ciclo 4 real
  { method: 'POST', path: '/api/workforce/schedule', name: 'Workforce: asignar triage', body: { task_type: 'triage', priority: 2, required_skills: ['network'], payload: { issue: 'caída' } } },
  { method: 'GET', path: '/api/workforce/assignments', name: 'Workforce: listar asignaciones' },
  { method: 'POST', path: '/api/rag/agentic', name: 'Agentic RAG: password reset', body: { query: 'cómo resetear password' } },
  { method: 'POST', path: '/api/abac/policies', name: 'ABAC: política admin billing', body: { name: 'admin billing', resource: 'billing', action: 'read', conditions: { 'subject.role': 'admin' }, effect: 'allow' } },
  { method: 'POST', path: '/api/abac/evaluate', name: 'ABAC: evaluar admin', body: { subject: { role: 'admin' }, resource: 'billing', action: 'read' } },
  { method: 'POST', path: '/api/agent-eval/cases', name: 'Agent Eval: caso golden', body: { intent: 'memory.remember', payload: { user_id: 'u-eval', content: 'test' }, expected_keys: ['id'] } },
  { method: 'GET', path: '/api/agent-eval/cases', name: 'Agent Eval: listar casos' },
  { method: 'POST', path: '/api/mesh/heartbeat', name: 'Mesh: heartbeat nodo', body: { agent_id: 'real-node-1', name: 'Nodo Real', role: 'worker', level: 2, skills: ['network','security'], endpoint: 'http://node1.local' } },
  { method: 'GET', path: '/api/mesh/active', name: 'Mesh: nodos activos' },
  // Stalled sessions
  { method: 'GET', path: '/api/sessions/stalled', name: 'Sessions stalled' },
  { method: 'POST', path: '/api/sessions/sweep', name: 'Sessions sweep' },
  // Self-healing / tracing
  { method: 'GET', path: '/api/self-healing/status', name: 'Self-healing status' },
  { method: 'GET', path: '/api/tracing/spans', name: 'Tracing spans' },
  // Innovaciones 2026 v2.6.3
  { method: 'POST', path: '/api/policies', name: 'Policy Engine: crear deny', body: { name: 'deny costoso', resource: 'mcp', action: 'tools/call', effect: 'deny', conditions: { gte: { 'agent.level': 5 }, gt: { cost_estimate: 1.0 } }, priority: 100 } },
  { method: 'POST', path: '/api/policies/decide', name: 'Policy Engine: decidir allow', body: { resource: 'mcp', action: 'tools/call', context: { agent: { level: 1 }, cost_estimate: 0.5 } } },
  { method: 'POST', path: '/api/sandboxes', name: 'Sandbox: crear', body: { agent_id: 'real-sandbox', allowed_tools: ['read'], resource_limits: { max_ms: 5000 } } },
  { method: 'GET', path: '/api/sandboxes', name: 'Sandbox: listar' },
  { method: 'POST', path: '/api/causal-alerts/ingest', name: 'Causal Alert: ingest', body: { metric: 'cpu', source: 'agent-real', value: 40 } },
  { method: 'GET', path: '/api/causal-alerts', name: 'Causal Alert: listar' },
  { method: 'POST', path: '/api/remediation/rules', name: 'Remediation DSL: crear', body: { name: 'notify high cpu', trigger: 'cpu.spike', condition: { severity: 'critical' }, actions: [{ type: 'notify', args: { channel: 'slack' } }, { type: 'noop', args: {} }], enabled: true } },
  { method: 'GET', path: '/api/remediation/rules', name: 'Remediation DSL: listar' },
  { method: 'POST', path: '/api/costs/charges', name: 'Cost: registrar cargo', body: { resource: 'agent.invoke', agent_id: 'agent-real', metric: 'agent.invocation', quantity: 5 } },
  { method: 'GET', path: '/api/costs/totals', name: 'Cost: totales' },
  { method: 'GET', path: '/api/costs/totals', name: 'Cost: totales' },
  { method: 'POST', path: '/api/executions', name: 'Durable Exec: crear pipeline', body: { name: 'real-pipeline', context: { step: 1 } } },
  { method: 'GET', path: '/api/executions', name: 'Durable Exec: listar' },
  { method: 'POST', path: '/api/mcp/gateway/tools', name: 'MCP Gateway: registrar tool', body: { server_id: 'github', tool_name: 'real_tool', rate_limit_rpm: 60, cost_per_call: 0.02 } },
  { method: 'GET', path: '/api/mcp/gateway/totals', name: 'MCP Gateway: totales' },
  { method: 'POST', path: '/api/failure-prediction/predict', name: 'Failure Prediction: predecir', body: { entity_type: 'service', entity_id: 'svc-real', signals: [{ signal_type: 'error_rate', value: 0.9, threshold: 0.7 }] } },
  { method: 'GET', path: '/api/failure-prediction/predictions', name: 'Failure Prediction: listar' },
  { method: 'POST', path: '/api/authz/tuples', name: 'ReBAC: write tuple', body: { object_type: 'document', object_id: 'real-doc', relation: 'owner', user_type: 'user', user_id: 'u-real' } },
  { method: 'POST', path: '/api/authz/check', name: 'ReBAC: check owner viewer', body: { object_type: 'document', object_id: 'real-doc', relation: 'viewer', user_type: 'user', user_id: 'u-real' } },
  { method: 'GET', path: '/api/authz/tuples', name: 'ReBAC: listar tuples' },
  // Conductor-lite real
  { method: 'POST', path: '/api/conductor/workflows', name: 'Conductor-lite: definir workflow', body: { name: 'real-approval', dag: { steps: [
    { seq: 1, id: 'submit', type: 'action', deps: [], handler: 'noop' },
    { seq: 2, id: 'review', type: 'action', deps: ['submit'], handler: 'noop' },
    { seq: 3, id: 'finalize', type: 'action', deps: ['review'], handler: 'noop' }
  ] }, compensation: [{ seq: 1, id: 'revoke', type: 'action', handler: 'noop' }] } },
  { method: 'GET', path: '/api/conductor/workflows', name: 'Conductor-lite: listar workflows' },
  { method: 'GET', path: '/api/health', name: 'Health check' },
  { method: 'GET', path: '/api/health/db', name: 'Health DB check' },
  // v2.6.9 — Prompt cache + Reasoning effort
  { method: 'GET', path: '/api/llm/cache/stats?days=7', name: 'Prompt cache: stats' },
  { method: 'POST', path: '/api/llm/cache/invalidate', name: 'Prompt cache: invalidate', body: { modelProvider: 'noop', modelName: 'noop' } },
  { method: 'POST', path: '/api/llm/cache/cleanup', name: 'Prompt cache: cleanup', body: {} },
  // v2.6.11 — MCP 1.0 streamable-HTTP
  { method: 'GET', path: '/mcp/info', name: 'MCP 1.0: server info (no auth required, but token attached)' },
  // v2.6.12 — Embeddings
  { method: 'GET', path: '/api/embeddings/stats', name: 'Embeddings: stats' },
  { method: 'POST', path: '/api/embeddings', name: 'Embeddings: upsert', body: { source: 'kb', source_id: 'real-1', text: 'real case test' } },
  { method: 'POST', path: '/api/embeddings/search', name: 'Embeddings: search', body: { query: 'real case test', k: 3 } }
];

async function main() {
  let token;
  {
    const r = await request('POST', '/api/auth/login', { email: 'admin@azurdesk.ai', password: 'admin123' });
    if (r.status !== 200 || !r.body.token) { console.error('login failed', r); process.exit(1); }
    token = r.body.token;
  }
  const checks = [];
  for (const c of CASES) {
    const r = await request(c.method, c.path, c.body, c.noToken ? null : token);
    const expected = c.expectStatus || 200;
    const ok = r.status === expected;
    checks.push({ name: c.name, ok, status: r.status, expected });
    console.log(`${ok ? '✅' : '❌'} ${c.name} (status ${r.status}, expected ${expected})`);
  }
  const passed = checks.filter(c => c.ok).length;
  console.log(`\nREAL CASES: ${passed}/${checks.length} pasaron`);
  process.exit(passed === checks.length ? 0 : 1);
}

main();
