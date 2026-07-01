let ws = null;
let wsNotifications = null;

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getTheme() { return localStorage.getItem('azurdesk-theme') || 'dark'; }
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
  localStorage.setItem('azurdesk-theme', theme);
}
function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
applyTheme(getTheme());

function toggleNav(el) {
  const links = el.nextElementSibling;
  if (links) {
    links.classList.toggle('collapsed');
    el.classList.toggle('collapsed', links.classList.contains('collapsed'));
  }
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('open');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

const VIEW_LABELS = {
  dashboard: 'Dashboard', tickets: 'Tickets', kanban: 'Kanban', rebalance: 'Rebalance AI', automaton: 'Automata',
  radar: 'Radar', mesh: 'Agent Mesh', telemetry: 'Telemetry', aaas: 'AAAS', marketing: 'Marketing AI',
  capacity: 'Capacity', platform: 'Platform', 'aaas-ops': 'AAAS Ops', 'api-explorer': 'API Explorer',
  'ollama-cloud': 'Ollama Cloud', guardrails: 'Guardrails', obsidian: 'Obsidian', notes: 'AI Notes',
  meetings: 'Meetings', memory: 'Memory Hub', rag: 'Hybrid RAG', ml: 'ML Tickets', agents: 'Agents Runtime',
  gateway: 'AaaS Gateway', otel: 'OTel + Self-Heal', queue: 'Event Queue', tracing: 'Tracing', handoffs: 'Handoffs',
  workflows: 'Durable Workflows', executions: 'Durable Executions', 'a2a-standard': 'A2A Tasks', 'agent-dag': 'Agent DAG',
  'agentic-rag': 'Agentic RAG',
  'embeddings': 'Embeddings & HNSW', 'browser-agent': 'Browser Agent', 'mcp-registry': 'MCP Registry', 'mcp-tools': 'MCP Tools',
  'mcp-gateway': 'MCP Gateway', 'local-llm': 'Local LLM', 'policy-engine': 'Policy Engine', sandbox: 'Agent Sandbox',
  'causal-alerts': 'Causal Alerts', remediation: 'Remediation DSL', 'failure-prediction': 'Failure Prediction', rebac: 'ReBAC AuthZ',
  'agent-cost': 'Agent Cost', billing: 'Billing', onboarding: 'Onboarding', legal: 'Legal', builder: 'Web Builder',
  chat: 'Chat AI', ai: 'AI Lab', cua: 'Computer Use', skills: 'Simplicio + Obsidian', docs: 'Documentos OCR',
  'agent-tracing': 'Agent Tracing',
  'llm-cache': 'LLM Cache & Reasoning'
};

function show(view) {
  const navItems = document.querySelectorAll('nav a');
  navItems.forEach((a) => a.classList.remove('active'));
  const active = Array.from(navItems).find((a) => {
    const label = (a.textContent || '').trim().toLowerCase();
    return label === (VIEW_LABELS[view] || view).toLowerCase();
  });
  if (active) {
    active.classList.add('active');
    const group = active.closest('.nav-links');
    if (group) group.classList.remove('collapsed');
  }
  const crumb = document.getElementById('crumb-view');
  if (crumb) crumb.textContent = VIEW_LABELS[view] || view;
  const main = document.getElementById('main');
  main.innerHTML = '';
  const renderer = RENDERERS[view]?.();
  if (renderer) renderer(main);
  closeSidebar();
  if (window.scrollTo) window.scrollTo(0, 0);
}

function setUserName(name) {
  const el = document.getElementById('user-name');
  const avatar = document.querySelector('.user-chip .avatar');
  if (el) el.textContent = name || 'Admin';
  if (avatar) avatar.textContent = (name || 'A').slice(0, 2).toUpperCase();
}

function handleGlobalSearch(e) {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) return;
  const entries = Object.entries(VIEW_LABELS);
  const hit = entries.find(([_, label]) => label.toLowerCase().includes(q));
  if (hit) show(hit[0]);
  e.target.value = '';
}

// Dashboard auto-render is deferred to a setTimeout so that RENDERERS (which
// is declared further down in this file) is fully initialized. Without this
// deferral, the const RENDERERS would be in the temporal dead zone when
// show('dashboard') runs at module top-level, causing a ReferenceError that
// prevents the entire UI from booting.
if (token) {
  setTimeout(() => { if (typeof RENDERERS !== 'undefined') show('dashboard'); }, 0);
}
document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('global-search');
  if (search) search.addEventListener('keydown', handleGlobalSearch);
});

const RENDERERS = {
  dashboard: () => renderDashboard,
  tickets: () => renderTickets,
  kanban: () => renderKanban,
  rebalance: () => renderRebalance,
  automaton: () => renderAutomaton,
  radar: () => renderRadar,
  mesh: () => renderMesh,
  telemetry: () => renderTelemetry,
  aaas: () => renderAAAS,
  marketing: () => renderMarketingAI,
  capacity: () => renderCapacity,
  platform: () => renderPlatform,
  'aaas-ops': () => renderAAASOpsDashboard,
  'api-explorer': () => renderApiExplorer,
  'ollama-cloud': () => renderOllamaCloud,
  guardrails: () => renderGuardrails,
  obsidian: () => renderObsidian,
  notes: () => renderNotes,
  meetings: () => renderMeetings,
  memory: () => renderMemoryHub,
  rag: () => renderHybridRAG,
  ml: () => renderMLTickets,
  agents: () => renderAgents,
  gateway: () => renderGateway,
  otel: () => renderOTel,
  queue: () => renderQueue,
  tracing: () => renderTracing,
  handoffs: () => renderHandoffs,
  workflows: () => renderDurableWorkflows,
  executions: () => renderDurableExecutions,
  'a2a-standard': () => renderA2AStandard,
  'agent-dag': () => renderAgentDAG,
  'agentic-rag': () => renderAgenticRAG,
  embeddings: () => renderEmbeddings,
  'browser-agent': () => renderBrowserAgent,
  'mcp-registry': () => renderMCPRegistry,
  'mcp-tools': () => renderMCPTools,
  'mcp-gateway': () => renderMCPGateway,
  'mcp-server': () => renderMCPServer,
  'local-llm': () => renderLocalLLM,
  'policy-engine': () => renderPolicyEngine,
  sandbox: () => renderSandbox,
  'causal-alerts': () => renderCausalAlerts,
  remediation: () => renderRemediation,
  'failure-prediction': () => renderFailurePrediction,
  rebac: () => renderReBAC,
  'agent-cost': () => renderAgentCost,
  billing: () => renderBillingCiclo3,
  onboarding: () => renderOnboarding,
  legal: () => renderLegal,
  builder: () => renderBuilder,
  chat: () => renderChat,
  ai: () => renderAI,
  cua: () => renderCUA,
  skills: () => renderSkills,
  docs: () => renderDocs,
  'agent-tracing': () => renderAgentTracing,
  'llm-cache': () => renderLLMCache,
  // ===== Consolidated compound views (v2.6.13 sidebar refactor) =====
  'operaciones-ai': () => renderOperacionesAI,    // sub: Automata / Radar / Capacity
  'agent-ops': () => renderAgentOps,              // sub: DAG / A2A / Browser
  'ai-memory': () => renderAIMemory,              // sub: Embeddings / ML / Notes / Lab
  'tracing': () => renderTracingSuite,            // sub: OTel / Spans / Agent
  'durable-execution': () => renderDurableExecution, // sub: Handoffs / Workflows / Runs
  'resilience': () => renderResilience,           // sub: Alerts / Remediation / Prediction
  'mcp': () => renderMCP,                         // sub: Tools / Gateway / Server
  'llm-providers': () => renderLLMProviders,      // sub: Local / Cloud
  'documentos': () => renderDocumentos            // sub: OCR / Skills
};

// NOTE: 'const views' is declared in cua.js, skills.js, and documents.js as a
// shared global registry. Do NOT re-declare it here — app.js's
// renderDocs/renderSkills/renderCUA consume the registry provided by those
// sibling scripts. Re-declaring causes a SyntaxError at script load and
// blocks the whole UI from booting.

// =============================================================================
// Consolidated compound views (v2.6.13 sidebar refactor).
// Each compound view embeds a Bootstrap sub-tab strip inside the main panel,
// reuses the existing single-purpose renderers (defined further down) and
// their corresponding fetch handlers, and keeps the sidebar compact.
// Pattern: a shared helper `renderCompoundView(el, opts)` paints the chrome,
// then the active sub-tab renderer is invoked. The sub-tab strip uses
// Bootstrap's nav-tabs markup so it matches the design system.
// =============================================================================

function renderCompoundView(el, opts) {
  // opts: { id, title, subtabs: [{id, label, render}], initial }
  const initial = opts.initial || opts.subtabs[0].id;
  el.innerHTML = `
    <h2>${opts.title}</h2>
    <ul class="nav nav-tabs mb-3" role="tablist" id="${opts.id}-tabs">
      ${opts.subtabs.map((s) => `
        <li class="nav-item" role="presentation">
          <button class="nav-link ${s.id === initial ? 'active' : ''}"
                  data-subtab="${s.id}" type="button" role="tab"
                  aria-selected="${s.id === initial}">${s.label}</button>
        </li>`).join('')}
    </ul>
    <div id="${opts.id}-content" class="compound-content"></div>`;
  const content = document.getElementById(opts.id + '-content');
  const tabBar = document.getElementById(opts.id + '-tabs');
  // The previous tabBar (and its click listener) was destroyed when we
  // rewrote el.innerHTML, so no listener accumulation can occur across
  // re-mounts of the same compound view. We just bind a fresh handler.
  function activate(id) {
    tabBar.querySelectorAll('button.nav-link').forEach((b) => {
      const on = b.dataset.subtab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    const sub = opts.subtabs.find((s) => s.id === id) || opts.subtabs[0];
    content.innerHTML = '';
    if (typeof sub.render === 'function') sub.render(content);
  }
  const handler = (ev) => {
    const btn = ev.target.closest('button.nav-link');
    if (btn && btn.dataset.subtab) activate(btn.dataset.subtab);
  };
  tabBar.addEventListener('click', handler);
  activate(initial);
}

async function renderOperacionesAI(el) {
  renderCompoundView(el, {
    id: 'opai',
    title: '⚙️ Operaciones AI',
    subtabs: [
      { id: 'automaton', label: '🤖 Automata', render: renderAutomaton },
      { id: 'radar',     label: '🚨 Radar',     render: renderRadar },
      { id: 'capacity',  label: '📈 Capacity',  render: renderCapacity }
    ]
  });
}

async function renderAgentOps(el) {
  renderCompoundView(el, {
    id: 'agentops',
    title: '🛠️ Agent Ops',
    subtabs: [
      { id: 'dag',     label: '🕸️ DAG',         render: renderAgentDAG },
      { id: 'a2a',     label: '📇 A2A Tasks',    render: renderA2AStandard },
      { id: 'browser', label: '🌐 Browser',      render: renderBrowserAgent }
    ]
  });
}

async function renderAIMemory(el) {
  renderCompoundView(el, {
    id: 'aimemory',
    title: '🧠 AI Memory & Models',
    subtabs: [
      { id: 'embeddings', label: '🔢 Embeddings',  render: renderEmbeddings },
      { id: 'ml',         label: '🧪 ML Tickets',  render: renderMLTickets },
      { id: 'notes',      label: '📝 AI Notes',    render: renderNotes },
      { id: 'lab',        label: '🤖 AI Lab',      render: renderAI }
    ]
  });
}

async function renderTracingSuite(el) {
  renderCompoundView(el, {
    id: 'tracesuite',
    title: '🔍 Tracing',
    subtabs: [
      { id: 'otel',   label: '📡 OTel + Self-Heal', render: renderOTel },
      { id: 'spans',  label: '🔍 Tracing',           render: renderTracing },
      { id: 'agent',  label: '📊 Agent Tracing',     render: renderAgentTracing }
    ]
  });
}

async function renderDurableExecution(el) {
  renderCompoundView(el, {
    id: 'durable',
    title: '🛡️ Durable Execution',
    subtabs: [
      { id: 'handoffs',   label: '🔄 Handoffs',            render: renderHandoffs },
      { id: 'workflows',  label: '⚙️ Conductor Workflows', render: renderConductorWorkflows },
      { id: 'executions', label: '🛡️ Durable Runs',        render: renderDurableExecutions }
    ]
  });
}

async function renderResilience(el) {
  renderCompoundView(el, {
    id: 'resilience',
    title: '🛡️ Resilience',
    subtabs: [
      { id: 'alerts',     label: '🚨 Causal Alerts',      render: renderCausalAlerts },
      { id: 'remediation',label: '🩹 Remediation DSL',    render: renderRemediation },
      { id: 'predict',    label: '🔮 Failure Prediction', render: renderFailurePrediction }
    ]
  });
}

async function renderMCP(el) {
  renderCompoundView(el, {
    id: 'mcp',
    title: '🔌 MCP — Model Context Protocol',
    subtabs: [
      { id: 'tools',   label: '🧰 MCP Tools',       render: renderMCPTools },
      { id: 'gateway', label: '🌐 MCP Gateway',     render: renderMCPGateway },
      { id: 'server',  label: '🖥️ MCP Server 1.0', render: renderMCPServer }
    ]
  });
}

async function renderLLMProviders(el) {
  renderCompoundView(el, {
    id: 'llmprov',
    title: '🤖 LLM Providers',
    subtabs: [
      { id: 'local', label: '🖥️ Local LLM',    render: renderLocalLLM },
      { id: 'cloud', label: '☁️ Ollama Cloud', render: renderOllamaCloud }
    ]
  });
}

async function renderDocumentos(el) {
  renderCompoundView(el, {
    id: 'docs',
    title: '📄 Documentos',
    subtabs: [
      { id: 'ocr',    label: '📑 Documentos OCR',       render: renderDocs },
      { id: 'skills', label: '🧠 Simplicio + Obsidian', render: renderSkills }
    ]
  });
}

async function renderDocs(el) {
  el.innerHTML = (window.AzurViews && window.AzurViews.docs) || '<h2>Documentos</h2><div class="card">Vista no disponible</div>';
  loadDocs();
}

async function renderSkills(el) {
  el.innerHTML = (window.AzurViews && window.AzurViews.skills) || '<h2>Skills</h2><div class="card">Vista no disponible</div>';
  loadRuns();
  loadObsidian();
}

async function renderCUA(el) {
  el.innerHTML = (window.AzurViews && window.AzurViews.cua) || '<h1>CUA</h1><div class="card">Vista no disponible</div>';
}

async function renderDashboard(el) {
  const m = await api('GET', '/api/helpdesk/metrics');
  const tenant = await api('GET', '/api/tenant').catch(() => ({ plan: 'free' }));
  el.innerHTML = `
    <div class="card" style="background:linear-gradient(90deg,var(--accent),var(--accent-light));color:#fff;">
      <h2>🚀 AzurDesk AI v2.0.0 — AAAS Platform</h2>
      <p>Bienvenido al centro de operaciones. Plan activo: <strong>${tenant.plan || 'free'}</strong>. Explora AAAS, Marketing AI, Workflows y Analytics desde el menú lateral.</p>
    </div>
    <h2>Dashboard</h2>
    <div class="grid-3">
      <div class="card metric"><h3>${m.total || 0}</h3><p>Tickets totales</p></div>
      <div class="card metric"><h3>${m.open || 0}</h3><p>Abiertos</p></div>
      <div class="card metric"><h3>${m.breached || 0}</h3><p>SLA vencidos</p></div>
    </div>
    <div class="card">
      <h3>Nuevo Ticket</h3>
      <input id="t-email" placeholder="Email del solicitante" />
      <input id="t-name" placeholder="Nombre" />
      <input id="t-subject" placeholder="Asunto" />
      <textarea id="t-body" rows="3" placeholder="Descripción"></textarea>
      <button onclick="createTicket()">Crear + Analizar con IA</button>
      <pre id="t-analysis"></pre>
    </div>`;
}

async function createTicket() {
  const body = {
    requester_email: document.getElementById('t-email').value,
    requester_name: document.getElementById('t-name').value,
    subject: document.getElementById('t-subject').value,
    body: document.getElementById('t-body').value
  };
  const r = await api('POST', '/api/tickets', body);
  document.getElementById('t-analysis').textContent = JSON.stringify(r.ticket, null, 2);
}

async function renderTickets(el) {
  const r = await api('GET', '/api/tickets');
  const list = r.tickets.map((t) => `
    <li>
      <div><strong>${esc(t.subject)}</strong> — ${esc(t.requester_name)}<br/>
        <span class="badge">L${t.level}</span> <span class="badge">${esc(t.priority)}</span> <span class="badge">${esc(t.status)}</span>
      </div>
      <button class="secondary" onclick="escalate('${t.id}')">Escalar</button>
    </li>`).join('');
  el.innerHTML = `<h2>Tickets</h2><ul class="ticket-list">${list || '<li>Sin tickets</li>'}</ul>`;
}

async function renderKanban(el) {
  const r = await api('GET', '/api/helpdesk/kanban');
  const cols = r.order || ['backlog','todo','in_progress','review','done'];
  const labels = { backlog: 'Backlog', todo: 'Por hacer', in_progress: 'En progreso', review: 'Revisión', done: 'Hecho' };
  let html = '<h2>🎯 Kanban de Tickets</h2><div style="display:flex;gap:12px;overflow-x:auto" id="kanban-board">';
  for (const col of cols) {
    html += `<div style="min-width:220px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px;"
      ondragover="event.preventDefault()" ondrop="dropTicket(event,'${col}')">
      <div style="font-weight:bold;margin-bottom:10px;color:#60a5fa;">${labels[col]} (${r.columns[col]?.length || 0})</div>
      ${(r.columns[col] || []).map((t) => `
        <div draggable="true" ondragstart="dragTicket(event,'${t.id}')" style="background:#1e293b;padding:10px;border-radius:6px;margin-bottom:8px;cursor:grab">
          <strong>${esc(t.subject)}</strong><br/>
          <span class="badge">L${t.level}</span> <span class="badge">${esc(t.priority)}</span><br/>
          <small>${esc(t.requester_name)}</small>
          ${t.assignee_id ? `<br/><small style="color:#94a3b8">👤 ${esc(t.assignee_id)}</small>` : ''}
        </div>`).join('')}
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

// =============================================================================
// Rebalance AI — refactorizado contra el contrato del backend (server.mjs
// L738-754) y conectado a la capa de servicios rebalance.service.js.
// - Estado reactivo centralizado en window.rebalanceState.
// - Spinners/Skeletons reales (sin setTimeout, sin datos mockeados).
// - Botones bloqueados durante el ciclo de petición (Idle->Loading->Success/Error).
// - Render dinámico: badges de burnout_risk, filtros visuales, sin <pre> con JSON.
// - Auto-load del historial en mount para acelerar la auditoría.
// =============================================================================

const REBALANCE_RISK_LEVELS = ['critical', 'high', 'medium', 'low'];
const REBALANCE_RISK_BADGES = {
  critical: 'badge bg-danger',
  high: 'badge bg-warning text-dark',
  medium: 'badge bg-info text-dark',
  low: 'badge bg-success',
};
const REBALANCE_RISK_LABELS = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
};

const rebalanceState = {
  healthLoading: false,
  recsLoading: false,
  applyLoading: false,
  logsLoading: false,
  filter: 'all', // 'all' | 'critical' | 'high' | 'medium' | 'low'
  snapshots: [],
  moves: [],
  applied: null,
  logs: [],
  lastError: null,
};

function rebalanceSpinnerHTML() {
  return '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>';
}

function rebalanceSkeletonRowHTML(width) {
  return (
    '<div class="placeholder-glow my-1">' +
      '<span class="placeholder col-' + (width || 6) + '"></span>' +
    '</div>'
  );
}

function rebalanceSkeletonListHTML(rows) {
  const n = rows || 4;
  let out = '<div class="card-body"><strong>Cargando…</strong>';
  for (let i = 0; i < n; i++) out += rebalanceSkeletonRowHTML(8);
  out += '</div>';
  return out;
}

function rebalanceEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rebalanceFormatDate(iso) {
  if (!iso) return '—';
  // El backend entrega timestamps ISO 8601 en UTC; se renderiza en local.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return rebalanceEscape(iso);
  return d.toLocaleString();
}

function rebalanceSetButtonsDisabled(disabled) {
  const ids = ['btn-health', 'btn-recs', 'btn-apply', 'btn-logs'];
  for (let i = 0; i < ids.length; i++) {
    const b = document.getElementById(ids[i]);
    if (b) b.disabled = disabled;
  }
}

function rebalanceSetButtonLoading(btnId, isLoading, idleLabel, busyLabel) {
  const b = document.getElementById(btnId);
  if (!b) return;
  b.disabled = !!isLoading;
  b.innerHTML = isLoading
    ? (rebalanceSpinnerHTML() + (busyLabel || 'Procesando…'))
    : (idleLabel || b.dataset.idleLabel || '');
}

function rebalanceRenderFilterBar() {
  const counts = { all: rebalanceState.snapshots.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (let i = 0; i < rebalanceState.snapshots.length; i++) {
    const r = rebalanceState.snapshots[i].burnout_risk;
    if (counts[r] !== undefined) counts[r]++;
  }
  let html = '<div class="btn-group btn-group-sm mb-2" role="group" aria-label="Filtro burnout">';
  const items = [
    { key: 'all', label: 'Todos' },
    { key: 'critical', label: 'Críticos' },
    { key: 'high', label: 'Altos' },
    { key: 'medium', label: 'Medios' },
    { key: 'low', label: 'Bajos' },
  ];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const active = rebalanceState.filter === it.key;
    html +=
      '<button type="button" class="btn btn-outline-secondary ' + (active ? 'active' : '') + '"' +
      ' data-filter="' + rebalanceEscape(it.key) + '" onclick="rebalanceApplyFilter(\'' + rebalanceEscape(it.key) + '\')">' +
      rebalanceEscape(it.label) + ' <span class="badge bg-light text-dark">' + counts[it.key] + '</span>' +
      '</button>';
  }
  html += '</div>';
  return html;
}

function rebalanceApplyFilter(filterKey) {
  rebalanceState.filter = REBALANCE_RISK_LEVELS.concat(['all']).indexOf(filterKey) >= 0 || filterKey === 'all'
    ? filterKey
    : 'all';
  rebalanceRenderSnapshots();
}

function rebalanceRenderSnapshots() {
  const target = document.getElementById('rebalance-snapshots');
  if (!target) return;
  if (rebalanceState.healthLoading) {
    target.innerHTML = rebalanceSkeletonListHTML(4);
    return;
  }
  if (!rebalanceState.snapshots.length) {
    target.innerHTML =
      '<div class="text-muted small">Sin snapshots todavía. Pulsa <strong>🫀 Health Snapshot</strong> para calcularlos.</div>';
    return;
  }
  const filtered = rebalanceState.snapshots.filter(function (s) {
    return rebalanceState.filter === 'all' ? true : s.burnout_risk === rebalanceState.filter;
  });
  if (!filtered.length) {
    target.innerHTML =
      '<div class="text-muted small">No hay agentes en el nivel <strong>' +
      rebalanceEscape(rebalanceState.filter) + '</strong>.</div>';
    return;
  }
  let html = rebalanceRenderFilterBar();
  html += '<div class="table-responsive"><table class="table table-sm table-striped align-middle">';
  html +=
    '<thead><tr>' +
      '<th>Agente</th><th>Carga</th><th>Burnout</th>' +
      '<th>Abiertos</th><th>Vencidos</th><th>Sentimiento</th>' +
    '</tr></thead><tbody>';
  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i];
    const risk = s.burnout_risk || 'low';
    const badge = REBALANCE_RISK_BADGES[risk] || 'badge bg-secondary';
    const label = REBALANCE_RISK_LABELS[risk] || risk;
    const sentiment = typeof s.avg_sentiment === 'number' ? s.avg_sentiment.toFixed(2) : '—';
    const loadClass = s.load_score >= 15 ? 'text-danger fw-bold' : (s.load_score >= 8 ? 'text-warning fw-bold' : '');
    html +=
      '<tr>' +
        '<td><code>' + rebalanceEscape((s.agent_id || '').slice(0, 8)) + '</code></td>' +
        '<td class="' + loadClass + '">' + rebalanceEscape(s.load_score) + '</td>' +
        '<td><span class="' + badge + '">' + rebalanceEscape(label) + '</span></td>' +
        '<td>' + rebalanceEscape(s.open_tickets) + '</td>' +
        '<td>' + rebalanceEscape(s.breached_tickets) + '</td>' +
        '<td>' + rebalanceEscape(sentiment) + '</td>' +
      '</tr>';
  }
  html += '</tbody></table></div>';
  target.innerHTML = html;
}

function rebalanceRenderRecommendations() {
  const target = document.getElementById('rebalance-recs');
  if (!target) return;
  if (rebalanceState.recsLoading) {
    target.innerHTML = rebalanceSkeletonListHTML(3);
    return;
  }
  if (!rebalanceState.moves.length) {
    target.innerHTML =
      '<div class="text-muted small">Sin recomendaciones pendientes. Tu equipo está balanceado.</div>';
    return;
  }
  let html = '<ul class="list-group">';
  for (let i = 0; i < rebalanceState.moves.length; i++) {
    const m = rebalanceState.moves[i];
    html +=
      '<li class="list-group-item d-flex justify-content-between align-items-start">' +
        '<div class="ms-2 me-auto">' +
          '<div class="fw-bold">Ticket <code>' + rebalanceEscape((m.ticket_id || '').slice(0, 8)) + '</code></div>' +
          '<div class="small">de <code>' + rebalanceEscape((m.from_agent_id || '').slice(0, 8)) + '</code> ' +
          '→ <code>' + rebalanceEscape((m.to_agent_id || '').slice(0, 8)) + '</code></div>' +
          '<div class="small text-muted">' + rebalanceEscape(m.reason || '') + '</div>' +
        '</div>' +
      '</li>';
  }
  html += '</ul>';
  target.innerHTML = html;
}

function rebalanceRenderApplyResult() {
  const target = document.getElementById('rebalance-apply');
  if (!target) return;
  if (rebalanceState.applyLoading) {
    target.innerHTML = rebalanceSpinnerHTML() + ' Aplicando rebalance real contra el backend…';
    return;
  }
  const a = rebalanceState.applied;
  if (!a) {
    target.innerHTML = '<div class="text-muted small">Aún no se ha aplicado ningún rebalance.</div>';
    return;
  }
  if (a.message && (!a.applied || a.applied.length === 0)) {
    target.innerHTML =
      '<div class="alert alert-secondary py-2 mb-0">' + rebalanceEscape(a.message) + '</div>';
    return;
  }
  const count = typeof a.count === 'number' ? a.count : (a.applied ? a.applied.length : 0);
  let html =
    '<div class="alert alert-success py-2">' +
      'Rebalance aplicado: <strong>' + rebalanceEscape(count) + '</strong> tickets reasignados.' +
    '</div>';
  if (a.applied && a.applied.length) {
    html += '<ul class="list-group list-group-flush">';
    for (let i = 0; i < a.applied.length; i++) {
      const m = a.applied[i];
      html +=
        '<li class="list-group-item px-0 py-1 small">' +
          '<code>' + rebalanceEscape((m.ticket_id || '').slice(0, 8)) + '</code>: ' +
          '<code>' + rebalanceEscape((m.from_agent_id || '').slice(0, 8)) + '</code> → ' +
          '<code>' + rebalanceEscape((m.to_agent_id || '').slice(0, 8)) + '</code> ' +
          '<span class="text-muted">— ' + rebalanceEscape(m.reason || '') + '</span>' +
        '</li>';
    }
    html += '</ul>';
  }
  target.innerHTML = html;
}

function rebalanceRenderLogs() {
  const ul = document.getElementById('rebalance-logs');
  if (!ul) return;
  if (rebalanceState.logsLoading) {
    ul.innerHTML =
      '<li class="list-group-item">' + rebalanceSpinnerHTML() + ' Cargando historial…</li>';
    return;
  }
  if (!rebalanceState.logs.length) {
    ul.innerHTML = '<li class="list-group-item text-muted">Sin rebalances aún</li>';
    return;
  }
  let html = '';
  for (let i = 0; i < rebalanceState.logs.length; i++) {
    const l = rebalanceState.logs[i];
    html +=
      '<li class="list-group-item">' +
        '<div class="d-flex justify-content-between">' +
          '<strong>' + rebalanceEscape(rebalanceFormatDate(l.created_at)) + '</strong>' +
          '<span class="badge bg-secondary">' + rebalanceEscape((l.id || '').slice(0, 8)) + '</span>' +
        '</div>' +
        '<div class="small">Ticket <code>' + rebalanceEscape((l.ticket_id || '').slice(0, 8)) + '</code></div>' +
        '<div class="small">' +
          'de <code>' + rebalanceEscape((l.from_agent_id || '').slice(0, 8)) + '</code> → ' +
          '<code>' + rebalanceEscape((l.to_agent_id || '').slice(0, 8)) + '</code>' +
        '</div>' +
        '<div class="small text-muted">' + rebalanceEscape(l.reason || '') + '</div>' +
      '</li>';
  }
  ul.innerHTML = html;
}

function rebalanceRenderError() {
  const target = document.getElementById('rebalance-error');
  if (!target) return;
  const e = rebalanceState.lastError;
  if (!e) { target.innerHTML = ''; target.classList.add('d-none'); return; }
  target.classList.remove('d-none');
  target.innerHTML =
    '<div class="alert alert-danger py-2 mb-2">' +
      '<strong>Error ' + rebalanceEscape(e.status || '') + ':</strong> ' +
      rebalanceEscape(e.message || 'Petición fallida') +
    '</div>';
}

async function renderRebalance(el) {
  el.innerHTML = `
    <h2>⚖️ Rebalance AI de Equipo</h2>
    <div id="rebalance-error" class="d-none"></div>

    <div class="card mb-3">
      <div class="card-body">
        <p class="mb-2">Análisis de carga, riesgo de burnout y skill matching para redistribuir tickets automáticamente.</p>
        <div class="btn-row mb-2">
          <button id="btn-health" data-idle-label="🫀 Health Snapshot" class="btn btn-primary btn-sm" onclick="loadHealth()">🫀 Health Snapshot</button>
          <button id="btn-recs"   data-idle-label="🔍 Recomendaciones"  class="btn btn-info btn-sm"    onclick="loadRecommendations()">🔍 Recomendaciones</button>
          <button id="btn-apply"  data-idle-label="⚡ Aplicar Rebalance" class="btn btn-warning btn-sm" onclick="applyRebalance()">⚡ Aplicar Rebalance</button>
        </div>
        <div id="rebalance-apply" class="mb-2"></div>
        <h6 class="mt-3 mb-1">Snapshots de salud</h6>
        <div id="rebalance-snapshots"></div>
        <h6 class="mt-3 mb-1">Recomendaciones</h6>
        <div id="rebalance-recs"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h5 class="mb-0">Historial de rebalances</h5>
          <button id="btn-logs" data-idle-label="🔄 Cargar logs" class="btn btn-outline-secondary btn-sm" onclick="loadRebalanceLogs()">🔄 Cargar logs</button>
        </div>
        <ul id="rebalance-logs" class="list-group list-group-flush"></ul>
      </div>
    </div>`;

  // Render inicial: skeletons de los contenedores reactivos.
  rebalanceRenderSnapshots();
  rebalanceRenderRecommendations();
  rebalanceRenderApplyResult();
  rebalanceRenderError();

  // Auto-load: historial en mount para acelerar la auditoría de producción.
  await loadRebalanceLogs();
}

async function loadHealth() {
  rebalanceState.healthLoading = true;
  rebalanceState.lastError = null;
  rebalanceRenderError();
  rebalanceRenderSnapshots();
  rebalanceSetButtonLoading('btn-health', true, '🫀 Health Snapshot', '🫀 Calculando…');
  try {
    const res = await window.RebalanceService.getHealth();
    if (!res.ok) {
      rebalanceState.lastError = res.error;
      rebalanceRenderError();
      rebalanceState.snapshots = [];
    } else {
      rebalanceState.snapshots = (res.data && res.data.snapshots) || [];
    }
  } catch (e) {
    rebalanceState.lastError = { status: 0, message: String(e && e.message ? e.message : e) };
    rebalanceRenderError();
    rebalanceState.snapshots = [];
  } finally {
    rebalanceState.healthLoading = false;
    rebalanceSetButtonLoading('btn-health', false, '🫀 Health Snapshot');
    rebalanceRenderSnapshots();
  }
}

async function loadRecommendations() {
  rebalanceState.recsLoading = true;
  rebalanceState.lastError = null;
  rebalanceRenderError();
  rebalanceRenderRecommendations();
  rebalanceSetButtonLoading('btn-recs', true, '🔍 Recomendaciones', '🔍 Analizando…');
  try {
    const res = await window.RebalanceService.getRecommendations();
    if (!res.ok) {
      rebalanceState.lastError = res.error;
      rebalanceRenderError();
      rebalanceState.moves = [];
    } else {
      rebalanceState.moves = (res.data && res.data.moves) || [];
    }
  } catch (e) {
    rebalanceState.lastError = { status: 0, message: String(e && e.message ? e.message : e) };
    rebalanceRenderError();
    rebalanceState.moves = [];
  } finally {
    rebalanceState.recsLoading = false;
    rebalanceSetButtonLoading('btn-recs', false, '🔍 Recomendaciones');
    rebalanceRenderRecommendations();
  }
}

async function applyRebalance() {
  if (!confirm('¿Aplicar rebalance real? Esto reasignará tickets en producción.')) return;
  rebalanceState.applyLoading = true;
  rebalanceState.lastError = null;
  rebalanceRenderError();
  rebalanceRenderApplyResult();
  rebalanceSetButtonLoading('btn-apply', true, '⚡ Aplicar Rebalance', '⚡ Aplicando…');
  rebalanceSetButtonsDisabled(true);
  try {
    const res = await window.RebalanceService.applyRebalance();
    if (!res.ok) {
      rebalanceState.lastError = res.error;
      rebalanceRenderError();
      rebalanceState.applied = null;
    } else {
      rebalanceState.applied = res.data || null;
      // Encadenamiento válido: tras aplicar, refrescar historial para auditoría.
      await loadRebalanceLogs();
    }
  } catch (e) {
    rebalanceState.lastError = { status: 0, message: String(e && e.message ? e.message : e) };
    rebalanceRenderError();
    rebalanceState.applied = null;
  } finally {
    rebalanceState.applyLoading = false;
    rebalanceSetButtonLoading('btn-apply', false, '⚡ Aplicar Rebalance');
    rebalanceSetButtonsDisabled(false);
    rebalanceRenderApplyResult();
  }
}

async function loadRebalanceLogs() {
  rebalanceState.logsLoading = true;
  rebalanceRenderLogs();
  rebalanceSetButtonLoading('btn-logs', true, '🔄 Cargar logs', '🔄 Cargando…');
  try {
    const res = await window.RebalanceService.getLogs();
    if (!res.ok) {
      rebalanceState.lastError = res.error;
      rebalanceRenderError();
      rebalanceState.logs = [];
    } else {
      rebalanceState.logs = (res.data && res.data.logs) || [];
    }
  } catch (e) {
    rebalanceState.lastError = { status: 0, message: String(e && e.message ? e.message : e) };
    rebalanceRenderError();
    rebalanceState.logs = [];
  } finally {
    rebalanceState.logsLoading = false;
    rebalanceSetButtonLoading('btn-logs', false, '🔄 Cargar logs');
    rebalanceRenderLogs();
  }
}

async function renderAutomaton(el) {
  el.innerHTML = `
    <h2>🤖 Automata — Reglas de Trigger</h2>
    <div class="card">
      <h3>Nueva regla</h3>
      <input id="rule-name" placeholder="Nombre (ej: Crítico → Slack)" />
      <input id="rule-desc" placeholder="Descripción" />
      <input id="rule-condition" placeholder='Condición JSON: {"priority":"critica"}' value='{"priority":"critica"}' />
      <textarea id="rule-actions" rows="3" placeholder='Acciones JSON: [{"type":"webhook","params":{"url":"...","message":"..."}}]'>[{"type":"webhook","params":{"url":"https://hooks.slack.com/services/TEST","message":"Ticket crítico detectado"}}]</textarea>
      <input id="rule-priority" type="number" placeholder="Prioridad" value="10" />
      <button onclick="createAutomatonRule()">Crear regla</button>
      <pre id="rule-result"></pre>
    </div>
    <div class="card">
      <h3>Reglas activas</h3>
      <button onclick="loadAutomatonRules()">🔄 Recargar</button>
      <ul id="automaton-rules" class="ticket-list"></ul>
    </div>
    <div class="card">
      <h3>Outbox / Webhooks pendientes</h3>
      <button onclick="loadAutomatonOutbox()">🔄 Recargar</button>
      <ul id="automaton-outbox" class="ticket-list"></ul>
    </div>`;
  loadAutomatonRules();
  loadAutomatonOutbox();
}

async function createAutomatonRule() {
  const body = {
    name: document.getElementById('rule-name').value,
    description: document.getElementById('rule-desc').value,
    condition: JSON.parse(document.getElementById('rule-condition').value),
    actions: JSON.parse(document.getElementById('rule-actions').value),
    priority: Number(document.getElementById('rule-priority').value),
    enabled: true
  };
  const r = await api('POST', '/api/automaton/rules', body);
  document.getElementById('rule-result').textContent = JSON.stringify(r, null, 2);
  loadAutomatonRules();
}

async function loadAutomatonRules() {
  const r = await api('GET', '/api/automaton/rules');
  const ul = document.getElementById('automaton-rules');
  if (!r.rules?.length) { ul.innerHTML = '<li>Sin reglas</li>'; return; }
  ul.innerHTML = r.rules.map((rule) => `
    <li>
      <strong>${rule.name}</strong> <span class="badge">prio ${rule.priority}</span> <span class="badge">${rule.enabled ? 'on' : 'off'}</span>
      <br/><small>${rule.description || ''}</small>
      <br/><code>${rule.condition}</code> → <code>${rule.actions}</code>
      <br/><button class="secondary" onclick="deleteAutomatonRule('${rule.id}')">Eliminar</button>
    </li>`).join('');
}

async function deleteAutomatonRule(id) {
  await api('DELETE', `/api/automaton/rules/${id}`);
  loadAutomatonRules();
}

async function loadAutomatonOutbox() {
  const r = await api('GET', '/api/automaton/outbox');
  const ul = document.getElementById('automaton-outbox');
  if (!r.items?.length) { ul.innerHTML = '<li>Outbox vacía</li>'; return; }
  ul.innerHTML = r.items.map((i) => `
    <li>
      <strong>${i.type}</strong> → ${i.destination.slice(0,60)}
      <br/><small>${i.status} | ${i.created_at}</small>
      <br/><code>${i.payload.slice(0,120)}...</code>
    </li>`).join('');
}

async function renderMesh(el) {
  el.innerHTML = `
    <h2>🕸️ Agent Mesh Discovery</h2>
    <div class="card">
      <h3>Publicar nodo experto</h3>
      <input id="mesh-name" placeholder="Nombre del agente" />
      <input id="mesh-agent-id" placeholder="agent_id único" />
      <input id="mesh-role" placeholder="Rol (specialist/technician)" value="specialist" />
      <input id="mesh-level" type="number" placeholder="Nivel 1-3" value="3" />
      <input id="mesh-skills" placeholder="Skills separados por coma: network,security" />
      <input id="mesh-endpoint" placeholder="Endpoint opcional" />
      <button onclick="publishMeshNode()">Publicar nodo</button>
      <pre id="mesh-result"></pre>
    </div>
    <div class="card">
      <h3>Nodos activos</h3>
      <button onclick="loadMeshNodes()">🔄 Recargar</button>
      <ul id="mesh-nodes" class="ticket-list"></ul>
    </div>
    <div class="card">
      <h3>Ranking para ticket</h3>
      <input id="mesh-ticket-tags" placeholder="Tags: network,security" />
      <input id="mesh-ticket-level" type="number" placeholder="Nivel requerido" value="3" />
      <button onclick="rankMeshForTicket()">🔍 Rankear</button>
      <ul id="mesh-ranked" class="ticket-list"></ul>
    </div>`;
  loadMeshNodes();
}

async function publishMeshNode() {
  const skills = document.getElementById('mesh-skills').value.split(',').map((s) => s.trim()).filter(Boolean);
  const body = {
    agent_id: document.getElementById('mesh-agent-id').value,
    name: document.getElementById('mesh-name').value,
    role: document.getElementById('mesh-role').value,
    level: Number(document.getElementById('mesh-level').value),
    skills,
    endpoint: document.getElementById('mesh-endpoint').value
  };
  const r = await api('POST', '/api/mesh/nodes', body);
  document.getElementById('mesh-result').textContent = JSON.stringify(r, null, 2);
  loadMeshNodes();
}

async function loadMeshNodes() {
  const r = await api('GET', '/api/mesh/nodes');
  const ul = document.getElementById('mesh-nodes');
  if (!r.nodes?.length) { ul.innerHTML = '<li>Sin nodos</li>'; return; }
  ul.innerHTML = r.nodes.map((n) => `
    <li>
      <strong>${n.name}</strong> <span class="badge">L${n.level}</span>
      <span class="badge">rep ${n.reputation}</span> <span class="badge">avail ${n.availability}</span>
      <br/><small>${n.skills.join(', ')} | ${n.role}</small>
      <br/><button class="secondary" onclick="deactivateMeshNode('${n.id}')">Desactivar</button>
    </li>`).join('');
}

async function deactivateMeshNode(id) {
  await api('DELETE', `/api/mesh/nodes/${id}`);
  loadMeshNodes();
}

async function rankMeshForTicket() {
  const tags = document.getElementById('mesh-ticket-tags').value.split(',').map((s) => s.trim()).filter(Boolean);
  const level = Number(document.getElementById('mesh-ticket-level').value);
  const r = await api('POST', '/api/mesh/rank', { ticket: { tags, level } });
  const ul = document.getElementById('mesh-ranked');
  if (!r.ranked?.length) { ul.innerHTML = '<li>Sin matches</li>'; return; }
  ul.innerHTML = r.ranked.map((x) => `
    <li>
      <strong>${x.node.name}</strong> <span class="badge">score ${x.score}</span>
      <br/><small>skills ${x.node.skills.join(', ')} | skillScore ${x.skillScore} | levelScore ${x.levelScore}</small>
    </li>`).join('');
}

async function renderCapacity(el) {
  const r = await api('GET', '/api/capacity/forecast?hours=4');
  const f = r.forecast || {};
  el.innerHTML = `
    <h2>📈 Capacity Planner</h2>
    <div class="grid-3">
      <div class="card metric"><h3>${f.utilization != null ? Math.round(f.utilization * 100) : 0}%</h3><p>Utilización proyectada</p></div>
      <div class="card metric"><h3>${f.agents_needed || 0}</h3><p>Agentes faltantes</p></div>
      <div class="card metric"><h3>${f.risk || 'low'}</h3><p>Riesgo de capacidad</p></div>
    </div>
    <div class="card">
      <pre id="capacity-result">${JSON.stringify(f, null, 2)}</pre>
      <div class="btn-row">
        <button onclick="loadCapacity(1)">1h</button>
        <button onclick="loadCapacity(4)">4h</button>
        <button onclick="loadCapacity(24)">24h</button>
      </div>
    </div>`;
}

async function loadCapacity(hours) {
  const r = await api('GET', '/api/capacity/forecast?hours=' + hours);
  document.getElementById('capacity-result').textContent = JSON.stringify(r.forecast, null, 2);
}

async function renderLegal(el) {
  el.innerHTML = `
    <h2>⚖️ Legal Case Management</h2>
    <div class="card">
      <h3>Nuevo caso legal</h3>
      <input id="legal-title" placeholder="Título del caso" />
      <textarea id="legal-summary" rows="3" placeholder="Resumen / hechos"></textarea>
      <select id="legal-type">
        <option value="contract">Contrato</option>
        <option value="litigation">Litigio</option>
        <option value="compliance">Compliance</option>
        <option value="ip">Propiedad Intelectual</option>
        <option value="employment">Laboral</option>
        <option value="corporate">Corporativo</option>
      </select>
      <input id="legal-requester-email" placeholder="Email solicitante" />
      <input id="legal-requester-name" placeholder="Nombre solicitante" />
      <input id="legal-amount" type="number" placeholder="Monto reclamado (opcional)" />
      <input id="legal-opposing" placeholder="Parte contraria" />
      <input id="legal-jurisdiction" placeholder="Jurisdicción" />
      <button onclick="createLegalCase()">Crear caso + IA de riesgo</button>
      <pre id="legal-result"></pre>
    </div>
    <div class="card">
      <h3>Casos activos</h3>
      <div class="toolbar">
        <select id="legal-filter-type" onchange="loadLegalCases()">
          <option value="">Todos los tipos</option>
          <option value="contract">Contrato</option>
          <option value="litigation">Litigio</option>
          <option value="compliance">Compliance</option>
        </select>
        <button onclick="loadLegalCases()">🔄 Recargar</button>
      </div>
      <ul id="legal-cases" class="ticket-list"></ul>
    </div>`;
  loadLegalCases();
}

async function createLegalCase() {
  const body = {
    title: document.getElementById('legal-title').value,
    summary: document.getElementById('legal-summary').value,
    type: document.getElementById('legal-type').value,
    requester_email: document.getElementById('legal-requester-email').value,
    requester_name: document.getElementById('legal-requester-name').value,
    requested_amount: Number(document.getElementById('legal-amount').value) || 0,
    opposing_party: document.getElementById('legal-opposing').value,
    jurisdiction: document.getElementById('legal-jurisdiction').value
  };
  const r = await api('POST', '/api/legal/cases', body);
  document.getElementById('legal-result').textContent = JSON.stringify(r.case, null, 2);
  loadLegalCases();
}

async function loadLegalCases() {
  const type = document.getElementById('legal-filter-type')?.value || '';
  const r = await api('GET', '/api/legal/cases' + (type ? '?type=' + type : ''));
  const ul = document.getElementById('legal-cases');
  if (!r.cases?.length) { ul.innerHTML = '<li>Sin casos</li>'; return; }
  ul.innerHTML = r.cases.map((c) => `
    <li style="align-items:flex-start;flex-direction:column;gap:6px">
      <div>
        <strong>${c.case_number}</strong> — ${c.title}
        <br/><span class="badge">${c.type}</span> <span class="badge">${c.priority}</span> <span class="badge">${c.status}</span>
        <br/><small>risk ${c.risk_score} | nivel aprobación ${c.approval_level} | vence ${c.due_at?.slice(0,10) || '-'}</small>
      </div>
      <div class="btn-row">
        <button class="secondary" onclick="advanceLegalCase('${c.id}')">Avanzar estado</button>
        <button class="secondary" onclick="viewLegalCase('${c.id}')">Ver</button>
      </div>
    </li>`).join('');
}

async function advanceLegalCase(id) {
  await api('POST', `/api/legal/cases/${id}/advance`);
  loadLegalCases();
}

async function viewLegalCase(id) {
  const r = await api('GET', `/api/legal/cases/${id}`);
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="card">
      <a href="#" onclick="show('legal'); return false;">← Volver a casos</a>
      <h2>${r.case.case_number} — ${r.case.title}</h2>
      <p>${r.case.summary}</p>
      <div class="btn-row">
        <span class="badge">${r.case.type}</span>
        <span class="badge">${r.case.status}</span>
        <span class="badge">${r.case.priority}</span>
        <span class="badge">risk ${r.case.risk_score}</span>
      </div>
      <h3>Revisión AI de contrato</h3>
      <div id="contract-review-form">
        <textarea id="contract-text" rows="6" placeholder="Pega aquí el texto del contrato o cláusula..."></textarea>
        <button onclick="reviewContract('${r.case.id}')">Analizar riesgo legal</button>
      </div>
      <div id="contract-review-result"></div>
      <h3>Revisiones previas</h3>
      <ul class="ticket-list">${(r.contract_reviews || []).map((rev) => `
        <li>
          <strong>${rev.title || 'Sin título'}</strong>
          <span class="badge">${rev.risk_level}</span>
          <span class="badge">score ${rev.overall_score.toFixed(2)}</span>
          <br/><small>${new Date(rev.created_at).toLocaleString()}</small>
          <br/><button class="secondary" onclick="viewContractReview('${rev.id}')">Ver detalle</button>
        </li>`).join('') || '<li>Sin revisiones</li>'}</ul>
      <h3>Tareas</h3>
      <ul class="ticket-list">${(r.tasks || []).map((t) => `<li>${t.title} — <span class="badge">${t.status}</span> <small>asignado ${t.assigned_to}</small></li>`).join('') || '<li>Sin tareas</li>'}</ul>
      <h3>Notas</h3>
      <ul class="ticket-list">${(r.notes || []).map((n) => `<li><strong>${n.author_name}</strong> <small>${n.is_internal ? 'interna' : 'pública'}</small><br/>${n.body}</li>`).join('') || '<li>Sin notas</li>'}</ul>
    </div>`;
}

async function reviewContract(caseId) {
  const text = document.getElementById('contract-text').value;
  if (!text) return;
  const r = await api('POST', '/api/legal/contracts/reviews', { case_id: caseId, title: 'Revisión manual', text });
  const out = document.getElementById('contract-review-result');
  if (!r.success) { out.innerHTML = `<p style="color:#fb7185">Error: ${r.error}</p>`; return; }
  const rev = r.review;
  const active = rev.findings.filter((f) => f.matched);
  const color = rev.risk_level === 'critical' ? '#fb7185' : rev.risk_level === 'high' ? '#fbbf24' : '#34d399';
  out.innerHTML = `
    <div class="card" style="border-left:4px solid ${color}">
      <h4>${rev.title}</h4>
      <p>Riesgo global: <strong style="color:${color}">${rev.risk_level.toUpperCase()}</strong> — score ${rev.overall_score.toFixed(2)}</p>
      <p>Cláusulas escaneadas: ${rev.metadata.clausesScanned} · Hallazgos: ${active.length}</p>
      <ul class="ticket-list">${active.map((f) => `
        <li>
          <strong>${f.name}</strong> <span class="badge">${f.severity}</span>
          <br/><small>score ${f.score.toFixed(2)} · matches: ${f.hits}</small>
          ${f.snippet ? `<br/><small style="color:#94a3b8">${f.snippet}</small>` : ''}
        </li>`).join('') || '<li>Sin hallazgos críticos</li>'}</ul>
    </div>`;
  viewLegalCase(caseId);
}

async function viewContractReview(id) {
  const r = await api('GET', `/api/legal/contracts/reviews/${id}`);
  if (!r.success) return;
  const rev = r.review;
  const active = rev.findings.filter((f) => f.matched);
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="card">
      <a href="#" onclick="show('legal'); return false;">← Volver a casos</a>
      <h2>${rev.title || 'Revisión de contrato'}</h2>
      <p><span class="badge">${rev.risk_level}</span> score ${rev.overall_score.toFixed(2)} · ${new Date(rev.created_at).toLocaleString()}</p>
      <h3>Hallazgos</h3>
      <ul class="ticket-list">${active.map((f) => `
        <li>
          <strong>${f.name}</strong> <span class="badge">${f.severity}</span>
          <br/><small>score ${f.score.toFixed(2)} · matches: ${f.hits}</small>
          ${f.snippet ? `<br/><small style="color:#94a3b8">${f.snippet}</small>` : ''}
        </li>`).join('') || '<li>Sin hallazgos</li>'}</ul>
      <button class="secondary" onclick="deleteContractReview('${rev.id}')">Eliminar revisión</button>
    </div>`;
}

async function deleteContractReview(id) {
  if (!confirm('¿Eliminar revisión?')) return;
  await api('DELETE', `/api/legal/contracts/reviews/${id}`);
  show('legal');
}

function dragTicket(ev, id) { ev.dataTransfer.setData('ticket-id', id); }

async function dropTicket(ev, status) {
  const id = ev.dataTransfer.getData('ticket-id');
  if (!id) return;
  await api('POST', `/api/tickets/${id}/move`, { status });
  show('kanban');
}

async function escalate(id) {
  await api('POST', `/api/tickets/${id}/escalate`, { level: 2, reason: 'Escalado manual' });
  show('tickets');
}

let siteComponents = [];
function renderBuilder(el) {
  el.innerHTML = `
    <h2>Web Builder</h2>
    <div class="component-palette">
      <button onclick="addComponent('hero')">Hero</button>
      <button onclick="addComponent('features')">Features</button>
      <button onclick="addComponent('faq')">FAQ</button>
      <button onclick="addComponent('contact')">Contacto</button>
      <button class="secondary" onclick="exportSite()">Exportar HTML</button>
    </div>
    <div class="builder-canvas" id="canvas"></div>
    <pre id="export-output" class="card"></pre>`;
}

function addComponent(type) {
  const defaults = {
    hero: { type: 'hero', props: { title: 'Hero Title', subtitle: 'Subtítulo', cta: 'Acción', bg: '#0f172a', color: '#ffffff' } },
    features: { type: 'features', props: { items: [{ title: 'Feature 1', text: 'Descripción' }] } },
    faq: { type: 'faq', props: { questions: [{ q: '¿Pregunta?', a: 'Respuesta.' }] } },
    contact: { type: 'contact', props: { email: 'soporte@azurdesk.ai', phone: '+52' } }
  };
  siteComponents.push(defaults[type]);
  renderCanvas();
}

function renderCanvas() {
  const c = document.getElementById('canvas');
  c.innerHTML = siteComponents.map((comp, i) => `
    <div style="border:1px solid #334155;padding:12px;margin:8px 0;border-radius:6px">
      <strong>${comp.type}</strong> — ${JSON.stringify(comp.props).slice(0, 80)}
      <button class="secondary" onclick="removeComponent(${i})">Eliminar</button>
    </div>`).join('');
}

function removeComponent(i) { siteComponents.splice(i, 1); renderCanvas(); }

async function exportSite() {
  // Primero crea un sitio demo y página
  const site = await api('POST', '/api/sites', { name: 'Demo Site', domain: 'demo.azurdesk.page' });
  const page = await api('POST', '/api/pages', { site_id: site.site.id, slug: 'index', title: 'Inicio', components: siteComponents });
  const exp = await api('GET', `/api/sites/${site.site.id}/export`);
  document.getElementById('export-output').textContent = exp.html.slice(0, 1200) + '...';
}

function renderChat(el) {
  el.innerHTML = `
    <h2>Chat AI L1/L2/L3</h2>
    <div class="chat-window">
      <div class="chat-messages" id="chat-msgs"><div class="msg bot">Hola, soy el agente AI de AzurDesk. ¿En qué puedo ayudarte?</div></div>
      <div class="chat-input">
        <input id="chat-input" placeholder="Escribe tu problema..." />
        <button onclick="sendChat()">Enviar</button>
      </div>
    </div>`;
  connectWS();
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/chat`);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const div = document.createElement('div');
    div.className = 'msg bot';
    div.textContent = m.text;
    document.getElementById('chat-msgs').appendChild(div);
    document.getElementById('chat-msgs').scrollTop = 99999;
  };
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value; if (!text) return;
  const div = document.createElement('div'); div.className = 'msg user'; div.textContent = text;
  document.getElementById('chat-msgs').appendChild(div);
  ws.send(JSON.stringify({ tenant_id: 'demo', session_id: 'web-' + Date.now(), user_email: user?.email || 'guest', content: text }));
  input.value = '';
}

async function renderAI(el) {
  el.innerHTML = `
    <h2>AI Lab</h2>
    <div class="card">
      <h3>Generar respuesta sugerida</h3>
      <textarea id="ai-subject" rows="2" placeholder="Asunto del ticket"></textarea>
      <textarea id="ai-body" rows="4" placeholder="Descripción"></textarea>
      <button onclick="generateReply()">Generar</button>
      <pre id="ai-reply"></pre>
    </div>
    <div class="card">
      <h3>Base de conocimiento (RAG)</h3>
      <input id="kb-q" placeholder="Buscar artículos..." />
      <button onclick="searchKB()">Buscar</button>
      <pre id="kb-results"></pre>
    </div>`;
}

async function generateReply() {
  const r = await api('POST', '/api/ai/reply', { subject: document.getElementById('ai-subject').value, body: document.getElementById('ai-body').value, category: 'general', priority: 'media', level: 1 });
  document.getElementById('ai-reply').textContent = r.reply;
}

async function searchKB() {
  const q = document.getElementById('kb-q').value;
  const r = await api('GET', '/api/kb/search?q=' + encodeURIComponent(q));
  document.getElementById('kb-results').textContent = JSON.stringify(r.articles, null, 2);
}

async function renderRadar(el) {
  el.innerHTML = `
    <h2>🚨 Predictive Incident Radar</h2>
    <div class="card">
      <div class="toolbar">
        <span id="radar-summary">Cargando...</span>
        <button onclick="loadRadar()">🔄 Recargar</button>
      </div>
      <ul id="radar-items" class="ticket-list"></ul>
    </div>`;
  loadRadar();
}

async function loadRadar() {
  const r = await api('GET', '/api/radar');
  const radar = r.radar;
  document.getElementById('radar-summary').innerHTML = `
    Horizonte: <strong>${radar.horizon_hours}h</strong> ·
    Total: <strong>${radar.total}</strong> ·
    <span style="color:#fb7185">Críticos: ${radar.critical}</span> ·
    <span style="color:#fbbf24">Altos: ${radar.high}</span>`;
  const ul = document.getElementById('radar-items');
  if (!radar.items?.length) { ul.innerHTML = '<li>Sin incidentes previstos</li>'; return; }
  ul.innerHTML = radar.items.map((i) => {
    const color = i.score >= 0.75 ? '#fb7185' : i.score >= 0.55 ? '#fbbf24' : i.score >= 0.35 ? '#f59e0b' : '#34d399';
    return `
      <li style="align-items:flex-start;flex-direction:column;gap:6px">
        <div>
          <strong style="color:${color}">${i.score.toFixed(2)} ${i.type === 'ticket' ? '🎫' : '⚖️'} ${i.title}</strong>
          <br/>
          <span class="badge">${i.type}</span>
          <span class="badge">${i.priority}</span>
          ${i.due_at ? `<span class="badge">vence ${i.due_at.slice(0,16).replace('T',' ')}</span>` : ''}
        </div>
        <small style="color:#94a3b8">
          prioridad ${(i.signals.priority_weight * 100).toFixed(0)}% ·
          tiempo ${(i.signals.time_pressure * 100).toFixed(0)}% ·
          asignación ${(i.signals.assigned_risk || i.signals.owner_risk || 0) * 100}% ·
          ${i.signals.escalation_risk !== undefined ? `escalado ${(i.signals.escalation_risk * 100).toFixed(0)}% ·` : ''}
          ${i.signals.sentiment_risk !== undefined ? `sentimiento ${(i.signals.sentiment_risk * 100).toFixed(0)}%` : ''}
        </small>
      </li>`;
  }).join('');
}

async function renderTelemetry(el) {
  if (wsTelemetry) { try { wsTelemetry.close(); } catch {} }
  el.innerHTML = `
    <h2>📡 Live Agent Telemetry</h2>
    <div class="card">
      <div class="toolbar">
        <span id="telemetry-status">Conectando...</span>
        <span id="telemetry-ts">--</span>
      </div>
      <div class="grid-3" id="telemetry-tiles">
        <div class="metric"><h3 id="tile-open">--</h3><p>Tickets abiertos</p></div>
        <div class="metric"><h3 id="tile-critical">--</h3><p>Tickets críticos</p></div>
        <div class="metric"><h3 id="tile-agents">--</h3><p>Agentes activos</p></div>
      </div>
      <h3>Agentes</h3>
      <ul id="telemetry-agents" class="ticket-list"></ul>
      <h3>Mesh</h3>
      <ul id="telemetry-mesh" class="ticket-list"></ul>
    </div>`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  wsTelemetry = new WebSocket(`${proto}://${location.host}/ws/telemetry?token=${encodeURIComponent(token)}`);
  wsTelemetry.onopen = () => document.getElementById('telemetry-status').textContent = '● En vivo';
  wsTelemetry.onclose = () => document.getElementById('telemetry-status').textContent = 'Desconectado';
  wsTelemetry.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'snapshot') {
      const d = m.data;
      document.getElementById('telemetry-ts').textContent = new Date(d.ts).toLocaleTimeString();
      document.getElementById('tile-open').textContent = d.tickets.open;
      document.getElementById('tile-critical').textContent = d.tickets.critical;
      document.getElementById('tile-agents').textContent = d.agents.length;
      document.getElementById('telemetry-agents').innerHTML = d.agents.map((a) => `
        <li>
          <strong>${a.name}</strong>
          <span class="badge">${a.role}</span>
          <span class="badge">${a.status}</span>
          <span class="badge">${a.burnout_risk}</span>
          <small>load ${a.load_score.toFixed(2)} · tickets ${a.open_tickets}</small>
        </li>`).join('') || '<li>Sin agentes</li>';
      document.getElementById('telemetry-mesh').innerHTML = d.mesh.map((n) => `
        <li>
          <strong>${n.name}</strong>
          <span class="badge">${n.role}</span>
          <small>availability ${(n.availability * 100).toFixed(0)}% · reputation ${(n.reputation * 100).toFixed(0)}%</small>
        </li>`).join('') || '<li>Sin nodos</li>';
    }
    if (m.type === 'notifications') {
      const badge = document.getElementById('notif-badge');
      if (badge) badge.textContent = m.data.unread;
    }
  };
}

async function renderAAAS(el) {
  el.innerHTML = `
    <h2>🧠 AAAS — AI-as-a-Service Router</h2>
    <div class="card">
      <h3>Cuentas de proveedores LLM</h3>
      <form onsubmit="event.preventDefault(); createProvider();">
        <input id="p-name" placeholder="Nombre (ej: Ollama Cloud)" required />
        <select id="p-kind">
          <option value="ollama">Ollama (local)</option>
          <option value="ollama_cloud">Ollama Cloud</option>
          <option value="openai_compatible">OpenAI-compatible</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="cohere">Cohere</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <input id="p-base" placeholder="Base URL" />
        <input id="p-key" type="password" placeholder="API Key" />
        <input id="p-models" placeholder='Modelos JSON: [{"id":"llama3.1","quality":0.8,"cost_per_1m":0}]' />
        <button>➕ Agregar proveedor</button>
      </form>
      <ul id="providers-list" class="ticket-list"></ul>
    </div>
    <div class="card">
      <h3>Generar con router</h3>
      <textarea id="router-prompt" rows="4" placeholder="Prompt..."></textarea>
      <select id="router-strategy">
        <option value="balanced">Balanced</option>
        <option value="cheap">Cheap</option>
        <option value="fast">Fast</option>
        <option value="quality">Quality</option>
      </select>
      <select id="router-preferred">
        <option value="">-- preferencia (auto) --</option>
        <option value="ollama">Ollama</option>
        <option value="openai">OpenAI</option>
      </select>
      <input id="router-max-cost" type="number" step="0.01" placeholder="max cost per 1M tokens" />
      <label><input id="router-fallback" type="checkbox" checked /> Fallback automático</label>
      <button onclick="runRouter()">▶️ Generar</button>
      <pre id="router-output"></pre>
    </div>
    <div class="card">
      <h3>Predicción de costo</h3>
      <input id="cost-prompt" placeholder="Prompt para estimar" />
      <button onclick="estimateRouterCost()">💰 Estimar</button>
      <pre id="cost-estimate"></pre>
    </div>
    <div class="card">
      <h3>Uso y costos</h3>
      <pre id="usage-stats"></pre>
    </div>`;
  loadProviders();
  loadUsage();
}

async function loadProviders() {
  const r = await api('GET', '/api/aaas/providers');
  document.getElementById('providers-list').innerHTML = r.providers.map((p) => `
    <li>
      <strong>${p.name}</strong>
      <span class="badge">${p.kind}</span>
      <span class="badge">${p.status}</span>
      <small>${p.models.length} modelos · prioridad ${p.priority}</small>
      <button class="secondary" onclick="deleteProvider('${p.id}')">🗑️</button>
    </li>`).join('') || '<li>Sin proveedores</li>';
}

async function createProvider() {
  const models = document.getElementById('p-models').value;
  const payload = {
    name: document.getElementById('p-name').value,
    kind: document.getElementById('p-kind').value,
    base_url: document.getElementById('p-base').value,
    api_key: document.getElementById('p-key').value,
    models: models ? JSON.parse(models) : []
  };
  await api('POST', '/api/aaas/providers', payload);
  await loadProviders();
}

async function deleteProvider(id) {
  await api('DELETE', `/api/aaas/providers/${id}`);
  await loadProviders();
}

async function runRouter() {
  const r = await api('POST', '/api/llm/generate', {
    prompt: document.getElementById('router-prompt').value,
    strategy: document.getElementById('router-strategy').value,
    preferred: document.getElementById('router-preferred').value || undefined,
    maxCostPer1M: parseFloat(document.getElementById('router-max-cost').value || 'NaN') || undefined,
    fallback: document.getElementById('router-fallback').checked
  });
  document.getElementById('router-output').textContent = JSON.stringify(r, null, 2);
  loadUsage();
}

async function estimateRouterCost() {
  const prompt = document.getElementById('cost-prompt').value;
  if (!prompt) return;
  const model = await api('GET', `/api/llm/models?complexity=medium`);
  const selected = model.selected;
  const tokens = Math.ceil(prompt.length / 4);
  const cost = (tokens / 1_000_000) * (selected.costPer1M || 0);
  document.getElementById('cost-estimate').textContent = `Modelo seleccionado: ${selected.name}\nTokens estimados: ${tokens}\nCosto estimado: $${cost.toFixed(6)}`;
}

async function loadUsage() {
  const r = await api('GET', '/api/llm/stats');
  document.getElementById('usage-stats').textContent = JSON.stringify(r.stats, null, 2);
}

async function renderMarketingAI(el) {
  el.innerHTML = `
    <h2>🚀 Marketing AI Campaign Builder</h2>
    <div class="grid-2">
      <div class="card">
        <h3>1. Selecciona agentes</h3>
        <div id="builder-agents">
          <label><input type="checkbox" id="use-content" checked> 📝 Content</label>
          <label><input type="checkbox" id="use-webpage"> 🌐 Web Page</label>
          <label><input type="checkbox" id="use-design"> 🎨 Design</label>
          <label><input type="checkbox" id="use-trending"> 📈 Trending</label>
          <label><input type="checkbox" id="use-lead" checked> 🎯 Lead Gen</label>
        </div>
      </div>
      <div class="card">
        <h3>2. Contexto de campaña</h3>
        <input id="mc-name" placeholder="Nombre campaña" />
        <input id="mc-brand" placeholder="Marca" />
        <input id="mc-goal" placeholder="Goal (ej: aumentar leads B2B)" />
        <input id="mc-audience" placeholder="Audiencia objetivo" />
        <input id="mc-channels" placeholder="Canales separados por coma" />
      </div>
    </div>
    <div class="card">
      <h3>3. Optimización de Prompt</h3>
      <select id="mc-prompt-variant">
        <option value="auto">🤖 Auto (mejor variant)</option>
        <option value="default">📝 Default</option>
      </select>
      <button onclick="buildCampaign()">🚀 Ejecutar Campaña</button>
      <pre id="mc-output"></pre>
    </div>
    <div class="card">
      <h3>📦 Campañas activas</h3>
      <ul id="campaigns-list" class="ticket-list"></ul>
    </div>
    <div class="card">
      <h3>🎨 Assets generados</h3>
      <ul id="assets-list" class="ticket-list"></ul>
    </div>`;
  loadCampaigns();
  loadAssets();
  loadPromptVariants();
}

async function loadPromptVariants() {
  try {
    const r = await api('GET', '/api/prompts');
    const select = document.getElementById('mc-prompt-variant');
    if (!select || !r.templates) return;
    for (const t of r.templates.slice(0, 10)) {
      const opt = document.createElement('option');
      opt.value = `template:${t.id}`;
      opt.textContent = `Prompt: ${t.name}`;
      select.appendChild(opt);
    }
  } catch {}
}

async function buildCampaign() {
  const agents = [];
  if (document.getElementById('use-content').checked) agents.push('content');
  if (document.getElementById('use-webpage').checked) agents.push('webpage');
  if (document.getElementById('use-design').checked) agents.push('design');
  if (document.getElementById('use-trending').checked) agents.push('trending');
  if (document.getElementById('use-lead').checked) agents.push('lead');

  const ctx = {
    brand: document.getElementById('mc-brand').value,
    topic: document.getElementById('mc-goal').value,
    audience: document.getElementById('mc-audience').value,
    channels: document.getElementById('mc-channels').value.split(',').map((s) => s.trim()).filter(Boolean),
    campaign_name: document.getElementById('mc-name').value
  };

  const output = document.getElementById('mc-output');
  output.textContent = 'Ejecutando agentes...';

  const results = [];
  for (const kind of agents) {
    try {
      const r = await api('POST', '/api/marketing/agents/run', { kind, ctx });
      results.push({ kind, result: r });
      output.textContent += `\n✅ ${kind}: ${r.success ? 'OK' : r.error}`;
    } catch (e) {
      results.push({ kind, error: e.message });
      output.textContent += `\n❌ ${kind}: ${e.message}`;
    }
  }

  await api('POST', '/api/marketing/campaigns', {
    name: ctx.campaign_name || `Campaña ${new Date().toLocaleString()}`,
    goal: ctx.topic,
    target_audience: ctx.audience,
    channels: ctx.channels,
    agents: agents
  });

  await loadCampaigns();
  await loadAssets();
}

async function runMarketingAgent() {
  const r = await api('POST', '/api/marketing/agents/run', {
    kind: document.getElementById('agent-kind').value,
    ctx: {
      brand: document.getElementById('agent-brand').value,
      topic: document.getElementById('agent-topic').value,
      audience: document.getElementById('agent-audience').value,
      channels: document.getElementById('agent-channels').value.split(',').map((s) => s.trim()).filter(Boolean)
    }
  });
  document.getElementById('agent-output').textContent = JSON.stringify(r, null, 2);
  await loadAssets();
}

async function createCampaign() {
  await api('POST', '/api/marketing/campaigns', {
    name: document.getElementById('c-name').value,
    goal: document.getElementById('c-goal').value,
    target_audience: document.getElementById('c-audience').value,
    channels: document.getElementById('c-channels').value.split(',').map((s) => s.trim()).filter(Boolean)
  });
  await loadCampaigns();
}

async function loadCampaigns() {
  const r = await api('GET', '/api/marketing/campaigns');
  const list = document.getElementById('campaigns-list');
  if (!list) return;
  list.innerHTML = r.campaigns.map((c) => `
    <li>
      <strong>${c.name}</strong>
      <span class="badge">${c.status}</span>
      <small>${c.goal} · ${c.channels.join(', ')} · ${c.assets.length} assets · ${c.leads.length} leads</small>
    </li>`).join('') || '<li>Sin campañas</li>';
}

async function loadAssets() {
  const r = await api('GET', '/api/marketing/assets');
  const list = document.getElementById('assets-list');
  if (!list) return;
  list.innerHTML = r.assets.slice(0, 20).map((a) => `
    <li>
      <strong>${a.title}</strong>
      <span class="badge">${a.kind}</span>
      <span class="badge">${a.status}</span>
      <small>${a.content.slice(0, 120)}...</small>
    </li>`).join('') || '<li>Sin assets</li>';
}

async function renderPlatform(el) {
  el.innerHTML = `
    <h2>⚙️ Platform — API Keys, Audit, Quota</h2>
    <div class="grid-2">
      <div class="card">
        <h3>API Keys</h3>
        <form onsubmit="event.preventDefault(); createApiKey()">
          <input id="apikey-name" placeholder="Nombre" style="width:60%">
          <button>Crear</button>
        </form>
        <ul id="apikey-list" class="ticket-list"></ul>
      </div>
      <div class="card">
        <h3>Quota</h3>
        <div id="quota-info">Cargando...</div>
        <form onsubmit="event.preventDefault(); updateQuota()" style="margin-top:10px">
          <label>Llamadas LLM/día: <input id="quota-calls" type="number" style="width:80px"></label>
          <label>Costo máx/día ($): <input id="quota-cost" type="number" step="0.01" style="width:80px"></label>
          <button>Actualizar</button>
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <h3>Audit Log</h3>
      <ul id="audit-list" class="ticket-list" style="max-height:300px;overflow-y:auto"></ul>
    </div>
    <div class="card" style="margin-top:12px">
      <h3>OpenAPI Spec</h3>
      <a href="/api/docs" target="_blank">/api/docs</a> — Spec OpenAPI 3.1 completa
    </div>`;
  loadApiKeys();
  loadQuota();
  loadAudit();
}

async function loadApiKeys() {
  const r = await api('GET', '/api/api-keys');
  const list = r.keys || [];
  document.getElementById('apikey-list').innerHTML = list.map((k) => `
    <li><strong>${esc(k.name)}</strong> <span class="badge">${k.key_prefix}...</span>
    <span class="badge">${k.enabled ? 'activa' : 'revocada'}</span>
    <small>${k.last_used_at ? 'usada ' + k.last_used_at.slice(0,10) : 'sin uso'}</small></li>`).join('') || '<li>Sin keys</li>';
}

async function createApiKey() {
  const name = document.getElementById('apikey-name').value.trim();
  if (!name) return;
  const r = await api('POST', '/api/api-keys', { name, scopes: ['read'] });
  if (r.key) alert('API Key creada: ' + r.key + '\nGuárdala, no se mostrará de nuevo.');
  document.getElementById('apikey-name').value = '';
  loadApiKeys();
}

async function loadQuota() {
  const r = await api('GET', '/api/quota');
  document.getElementById('quota-info').innerHTML = `
    <p>Llamadas hoy: <strong>${r.llm_calls_today}</strong> / ${r.limits.max_llm_calls_per_day} (quedan ${r.remaining_calls})</p>
    <p>Costo hoy: <strong>$${r.llm_cost_today.toFixed(4)}</strong> / $${r.limits.max_llm_cost_per_day} (queda $${r.remaining_cost.toFixed(4)})</p>
    <p>Reset: ${r.reset_at ? r.reset_at.slice(0,19) : 'N/A'}</p>`;
  document.getElementById('quota-calls').value = r.limits.max_llm_calls_per_day;
  document.getElementById('quota-cost').value = r.limits.max_llm_cost_per_day;
}

async function updateQuota() {
  const calls = parseInt(document.getElementById('quota-calls').value);
  const cost = parseFloat(document.getElementById('quota-cost').value);
  await api('PUT', '/api/quota', { max_llm_calls_per_day: calls, max_llm_cost_per_day: cost });
  loadQuota();
}

async function loadAudit() {
  const r = await api('GET', '/api/audit/logs');
  const logs = r.logs || [];
  document.getElementById('audit-list').innerHTML = logs.slice(0, 50).map((l) => `
    <li><strong>${esc(l.action)}</strong> <span class="badge">${esc(l.resource_type || '')}</span>
    <small>${esc(l.actor_id)} — ${l.created_at ? l.created_at.slice(0,19) : ''}</small></li>`).join('') || '<li>Sin logs</li>';
}

async function renderAAASOpsDashboard(el) {
  el.innerHTML = `
    <h2>🛰️ AAAS Operations Center</h2>
    <div class="grid-3">
      <div class="card metric">
        <h3 id="ops-calls">...</h3>
        <p>LLM Calls (7d)</p>
      </div>
      <div class="card metric">
        <h3 id="ops-cost">...</h3>
        <p>Costo (7d)</p>
      </div>
      <div class="card metric">
        <h3 id="ops-latency">...</h3>
        <p>Latencia promedio</p>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>📊 Costo por día</h3>
        <table id="ops-daily" class="ticket-list"></table>
      </div>
      <div class="card">
        <h3>🏆 Top modelos</h3>
        <ul id="ops-models" class="ticket-list"></ul>
      </div>
    </div>
    <div class="card">
      <h3>⚡ Workflows</h3>
      <ul id="ops-workflows" class="ticket-list"></ul>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>🗂️ Assets</h3>
        <div id="ops-assets-stats">...</div>
        <ul id="ops-assets" class="ticket-list"></ul>
      </div>
      <div class="card">
        <h3>🔐 Mis permisos</h3>
        <ul id="ops-perms" class="ticket-list"></ul>
      </div>
    </div>`;
  loadAAASOps();
}

async function loadAAASOps() {
  const [analytics, workflows, assets, rbac] = await Promise.all([
    api('GET', '/api/analytics/summary'),
    api('GET', '/api/workflows'),
    api('GET', '/api/assets'),
    api('GET', '/api/rbac/me')
  ]);

  if (analytics.success) {
    const s = analytics.summary.totals;
    document.getElementById('ops-calls').textContent = s.requests;
    document.getElementById('ops-cost').textContent = '$' + (s.cost || 0).toFixed(4);
    document.getElementById('ops-latency').textContent = Math.round(s.avg_latency || 0) + 'ms';
    document.getElementById('ops-daily').innerHTML = `
      <tr><th>Día</th><th>Calls</th><th>Tokens</th><th>Costo</th></tr>` +
      analytics.summary.daily.map(d => `
      <tr><td>${d.day}</td><td>${d.requests}</td><td>${d.tokens || 0}</td><td>$${(d.cost || 0).toFixed(4)}</td></tr>`).join('');
  }

  try {
    const top = await api('GET', '/api/analytics/top-models');
    document.getElementById('ops-models').innerHTML = top.models.slice(0, 5).map(m => `
      <li>
        <strong>${m.model}</strong> <span class="badge">${m.provider}</span>
        <small>${m.requests} calls · $${(m.cost || 0).toFixed(4)} · ${Math.round(m.avg_latency || 0)}ms</small>
      </li>`).join('') || '<li>Sin datos</li>';
  } catch {}

  document.getElementById('ops-workflows').innerHTML = workflows.workflows.map(w => `
    <li>
      <strong>${w.name}</strong> <span class="badge">${w.status}</span>
      <small>${w.nodes.length} nodos · v${w.version}</small>
    </li>`).join('') || '<li>Sin workflows</li>';

  document.getElementById('ops-assets-stats').innerHTML = `
    <p>Usado: <strong>${formatBytes(assets.stats.used_bytes)}</strong> / ${formatBytes(assets.stats.quota_bytes)}</strong> · ${assets.assets.length} archivos</p>`;
  document.getElementById('ops-assets').innerHTML = assets.assets.slice(0, 10).map(a => `
    <li>
      <strong>${a.filename}</strong> <span class="badge">${a.mime_type}</span>
      <small>${formatBytes(a.size_bytes)}</small>
    </li>`).join('') || '<li>Sin assets</li>';

  document.getElementById('ops-perms').innerHTML = (rbac.permissions || []).slice(0, 20).map(p => `
    <li><span class="badge">${p.permission}</span></li>`).join('') || '<li>Sin permisos</li>';
}

function formatBytes(b) {
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function renderApiExplorer(el) {
  el.innerHTML = `
    <h2>🔍 API Explorer</h2>
    <div class="card">
      <h3>OpenAPI Spec</h3>
      <pre id="api-spec">Cargando...</pre>
    </div>`;
  const spec = await api('GET', '/api/docs');
  document.getElementById('api-spec').textContent = JSON.stringify(spec, null, 2);
}

async function renderOnboarding(el) {
  el.innerHTML = `
    <h2>🚀 Onboarding Wizard</h2>
    <div id="wizard">
      <div class="card" data-step="1">
        <h3>Paso 1: Selecciona tu plan</h3>
        <div id="plans-list">Cargando...</div>
        <button onclick="nextStep(2)">Siguiente →</button>
      </div>
      <div class="card hidden" data-step="2">
        <h3>Paso 2: Configura tu primer proveedor LLM</h3>
        <select id="onb-provider-kind">
          <option value="ollama_cloud">Ollama Cloud</option>
          <option value="ollama">Ollama Local</option>
          <option value="openai_compatible">OpenAI-compatible</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="groq">Groq</option>
          <option value="cohere">Cohere</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <input id="onb-provider-name" placeholder="Nombre del proveedor" />
        <input id="onb-provider-base" placeholder="Base URL" />
        <input id="onb-provider-key" type="password" placeholder="API Key" />
        <input id="onb-provider-models" placeholder='Modelos JSON: [{"id":"llama3.1","quality":0.8,"cost_per_1m":0}]' />
        <button onclick="nextStep(3)">Siguiente →</button>
      </div>
      <div class="card hidden" data-step="3">
        <h3>Paso 3: Crea tu primer Workflow</h3>
        <input id="onb-wf-name" placeholder="Nombre del workflow" />
        <input id="onb-wf-prompt" placeholder="Prompt inicial" />
        <button onclick="nextStep(4)">Siguiente →</button>
      </div>
      <div class="card hidden" data-step="4">
        <h3>Paso 4: Test en vivo</h3>
        <input id="onb-test-prompt" placeholder="Escribe un prompt de prueba" />
        <button onclick="runOnboardingTest()">▶️ Probar AAAS Router</button>
        <pre id="onb-test-output"></pre>
        <button onclick="finishOnboarding()">Finalizar 🎉</button>
      </div>
    </div>`;
  loadPlansForWizard();
}

async function loadPlansForWizard() {
  try {
    const r = await api('GET', '/api/plans');
    document.getElementById('plans-list').innerHTML = r.plans.map(p => `
      <label class="plan-card" style="display:block;margin:8px 0;padding:12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
        <input type="radio" name="onb-plan" value="${p.id}" ${p.id === 'free' ? 'checked' : ''}>
        <strong>${p.id.toUpperCase()}</strong> — ${p.max_llm_calls_per_day} calls/día · $${p.max_llm_cost_per_day} costo/día
      </label>`).join('');
  } catch (e) {
    document.getElementById('plans-list').textContent = 'Error cargando planes: ' + e.message;
  }
}

function nextStep(n) {
  document.querySelectorAll('#wizard .card').forEach(c => c.classList.add('hidden'));
  document.querySelector(`#wizard .card[data-step="${n}"]`).classList.remove('hidden');
}

async function runOnboardingTest() {
  const prompt = document.getElementById('onb-test-prompt').value;
  if (!prompt) return;
  const output = document.getElementById('onb-test-output');
  output.textContent = 'Generando...';
  try {
    const r = await api('POST', '/api/aaas/generate', { prompt, strategy: 'balanced' });
    output.textContent = JSON.stringify(r, null, 2);
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
  }
}

async function finishOnboarding() {
  try {
    // Save provider
    const models = document.getElementById('onb-provider-models').value;
    const providerPayload = {
      name: document.getElementById('onb-provider-name').value || 'Mi Proveedor',
      kind: document.getElementById('onb-provider-kind').value,
      base_url: document.getElementById('onb-provider-base').value,
      api_key: document.getElementById('onb-provider-key').value,
      models: models ? JSON.parse(models) : [{ id: 'default', quality: 0.8, cost_per_1m: 0 }]
    };
    await api('POST', '/api/aaas/providers', providerPayload);

    // Create workflow
    const wfName = document.getElementById('onb-wf-name').value || 'Mi primer workflow';
    const wfPrompt = document.getElementById('onb-wf-prompt').value || 'Saluda al usuario';
    await api('POST', '/api/workflows', {
      name: wfName,
      status: 'active',
      nodes: [
        { id: 'n1', type: 'prompt', config: { prompt: wfPrompt } },
        { id: 'n2', type: 'output', config: {} }
      ],
      edges: [{ from: 'n1', to: 'n2' }],
      variables: {}
    });

    // Upgrade plan if selected
    const plan = document.querySelector('input[name="onb-plan"]:checked')?.value;
    if (plan && plan !== 'free') {
      await api('POST', '/api/tenant/upgrade', { plan });
    }

    alert('🎉 Onboarding completado. AzurDesk AI está listo para usarse.');
    show('dashboard');
  } catch (e) {
    alert('Error finalizando onboarding: ' + e.message);
  }
}

async function renderObsidian(el) {
  el.innerHTML = `
    <h2>🧠 Obsidian Vault Browser</h2>
    <div class="card">
      <div id="obs-vault-info">Detectando vault...</div>
      <div id="obs-folders"></div>
    </div>
    <div class="card">
      <h3>Notas</h3>
      <div id="obs-notes">Selecciona una carpeta</div>
    </div>
    <div class="card">
      <h3>Contenido</h3>
      <pre id="obs-content"></pre>
    </div>`;
  const r = await api('GET', '/api/obsidian/folders');
  document.getElementById('obs-vault-info').innerHTML = `
    Vault: <code>${r.path}</code> · ${r.exists ? '✅ Encontrado' : '⚠️ No encontrado'}
    <br/>
    <input id="obs-search" placeholder="Buscar en notas..." />
    <button onclick="searchObsidian()">🔍 Buscar</button>`;
  document.getElementById('obs-folders').innerHTML = r.folders.map(f => `
    <button onclick="loadObsidianNotes('${f.path}')">${f.name}</button>`).join('') || 'Sin carpetas';
}

async function loadObsidianNotes(folder) {
  const r = await api('GET', '/api/obsidian/notes?folder=' + encodeURIComponent(folder));
  document.getElementById('obs-notes').innerHTML = r.notes.map(n => `
    <button onclick="readObsidianNote('${n.path}')">${n.name}</button>`).join('') || 'Sin notas';
}

async function readObsidianNote(path) {
  const r = await api('GET', '/api/obsidian/notes/read?path=' + encodeURIComponent(path));
  document.getElementById('obs-content').textContent = r.content || 'No se pudo leer la nota';
}

async function searchObsidian() {
  const q = document.getElementById('obs-search').value;
  if (!q) return;
  const r = await api('GET', '/api/obsidian/search?q=' + encodeURIComponent(q));
  document.getElementById('obs-notes').innerHTML = r.results.map(n => `
    <button onclick="readObsidianNote('${n.path}')">${n.folder}/${n.name}</button>
    <small>${(n.snippet || '').slice(0, 80)}...</small>`).join('') || 'Sin resultados';
}

async function renderNotes(el) {
  el.innerHTML = `
    <h2>📝 AI Notes Generator</h2>
    <div class="card">
      <select id="note-entity-type">
        <option value="ticket">Ticket</option>
        <option value="campaign">Campaign</option>
        <option value="analytics">Analytics</option>
        <option value="meeting">Meeting</option>
        <option value="agent_run">Agent Run</option>
      </select>
      <textarea id="note-entity" rows="6" placeholder='{ "id": "TK-1", "subject": "..." }'></textarea>
      <button onclick="generateNote()">Generar Nota Markdown</button>
      <pre id="note-output"></pre>
    </div>`;
}

async function generateNote() {
  const type = document.getElementById('note-entity-type').value;
  const raw = document.getElementById('note-entity').value;
  let entity;
  try { entity = JSON.parse(raw); } catch (e) { alert('JSON inválido'); return; }
  const r = await api('POST', '/api/notes/generate', { entity_type: type, entity });
  document.getElementById('note-output').textContent = r.note;
}

async function renderMeetings(el) {
  el.innerHTML = `
    <h2>📅 Teams Meeting Pipeline</h2>
    <div class="card">
      <input id="mt-title" placeholder="Título de la reunión" />
      <textarea id="mt-summary" rows="8" placeholder="Pega aquí el resumen de Teams..."></textarea>
      <button onclick="processMeeting()">Procesar y crear accionables</button>
      <pre id="mt-output"></pre>
    </div>`;
}

async function processMeeting() {
  const title = document.getElementById('mt-title').value;
  const summary = document.getElementById('mt-summary').value;
  const r = await api('POST', '/api/meetings/process', { title, summary });
  document.getElementById('mt-output').textContent = JSON.stringify(r.result, null, 2);
}

async function renderMemoryHub(el) {
  el.innerHTML = `
    <h2>🧬 Memory Hub (Engram)</h2>
    <div class="card">
      <input id="mem-user" placeholder="user_id" />
      <textarea id="mem-content" rows="4" placeholder="Memoria a persistir..."></textarea>
      <input id="mem-type" placeholder="tipo (episodic/semantic/agent_run)" value="episodic" />
      <button onclick="rememberMemory()">Recordar</button>
    </div>
    <div class="card">
      <input id="mem-query" placeholder="query de recall..." />
      <button onclick="recallMemory()">Recordar (recall)</button>
      <pre id="mem-output"></pre>
    </div>`;
}

async function rememberMemory() {
  const r = await api('POST', '/api/memory/remember', {
    user_id: document.getElementById('mem-user').value,
    content: document.getElementById('mem-content').value,
    type: document.getElementById('mem-type').value
  });
  document.getElementById('mem-output').textContent = JSON.stringify(r.memory, null, 2);
}

async function recallMemory() {
  const r = await api('POST', '/api/memory/recall', {
    user_id: document.getElementById('mem-user').value,
    query: document.getElementById('mem-query').value
  });
  document.getElementById('mem-output').textContent = JSON.stringify(r.memories, null, 2);
}

async function renderHybridRAG(el) {
  el.innerHTML = `
    <h2>🕸️ Hybrid RAG</h2>
    <div class="card">
      <input id="rag-user" placeholder="user_id" />
      <input id="rag-query" placeholder="Buscar en KB + memoria + vector..." />
      <button onclick="searchHybrid()">Buscar</button>
      <pre id="rag-output"></pre>
    </div>`;
}

async function searchHybrid() {
  const r = await api('POST', '/api/search/hybrid', {
    user_id: document.getElementById('rag-user').value,
    query: document.getElementById('rag-query').value
  });
  document.getElementById('rag-output').textContent = JSON.stringify(r.results, null, 2);
}

async function renderMLTickets(el) {
  el.innerHTML = `
    <h2>🧪 ML Ticket Classifier</h2>
    <div class="card">
      <textarea id="ml-samples" rows="6" placeholder='samples: [{"text":"...","label":1}, ...]'></textarea>
      <input id="ml-text" placeholder="Texto de ticket a predecir" />
      <button onclick="predictTicket()">Predecir</button>
      <pre id="ml-output"></pre>
    </div>`;
}

async function predictTicket() {
  let samples = [];
  try { samples = JSON.parse(document.getElementById('ml-samples').value || '[]'); } catch {}
  const r = await api('POST', '/api/tickets/predict', {
    samples,
    text: document.getElementById('ml-text').value
  });
  document.getElementById('ml-output').textContent = JSON.stringify(r.prediction, null, 2);
}

async function renderAgentHarness(el) {
  el.innerHTML = `
    <h2>🤖 Agent Harness</h2>
    <div class="card">
      <h3>Registrar Skill</h3>
      <input id="h-agent" placeholder="agent_id" />
      <input id="h-name" placeholder="Nombre skill" />
      <input id="h-desc" placeholder="Descripción" />
      <input id="h-params" placeholder="params JSON" value='["x"]' />
      <button onclick="registerSkill()">Registrar</button>
      <h3>Agendar</h3>
      <input id="h-sched-name" placeholder="Nombre tarea" />
      <input id="h-cron" placeholder="cron" value="0 9 * * *" />
      <input id="h-goal" placeholder="Goal" />
      <button onclick="scheduleTask()">Agendar</button>
      <h3>Sandbox</h3>
      <input id="h-cmd" placeholder="comando windows" value="echo harness" />
      <button onclick="runSandbox()">Ejecutar</button>
      <pre id="h-output"></pre>
    </div>`;
}
async function registerSkill() {
  const r = await api('POST', '/api/agent-harness/skills', { agent_id: document.getElementById('h-agent').value, name: document.getElementById('h-name').value, description: document.getElementById('h-desc').value, params: JSON.parse(document.getElementById('h-params').value) });
  document.getElementById('h-output').textContent = JSON.stringify(r.skill, null, 2);
}
async function scheduleTask() {
  const r = await api('POST', '/api/agent-harness/schedules', { agent_id: document.getElementById('h-agent').value, name: document.getElementById('h-sched-name').value, cron: document.getElementById('h-cron').value, goal: document.getElementById('h-goal').value });
  document.getElementById('h-output').textContent = JSON.stringify(r.schedule, null, 2);
}
async function runSandbox() {
  const r = await api('POST', '/api/agent-harness/sandbox', { agent_id: document.getElementById('h-agent').value, command: document.getElementById('h-cmd').value, timeoutMs: 5000 });
  document.getElementById('h-output').textContent = JSON.stringify(r.run, null, 2);
}

async function renderCostRouter(el) {
  el.innerHTML = `
    <h2>💰 Cost Router</h2>
    <div class="card">
      <textarea id="cr-text" rows="4" placeholder="Texto a enrutar"></textarea>
      <button onclick="routeCost()">Enrutar</button>
      <pre id="cr-output"></pre>
    </div>`;
}
async function routeCost() {
  const r = await api('POST', '/api/cost-router', { text: document.getElementById('cr-text').value });
  document.getElementById('cr-output').textContent = JSON.stringify(r.route, null, 2);
}

async function renderGuardrails(el) {
  el.innerHTML = `
    <h2>🛡️ Guardrails</h2>
    <div class="card">
      <input id="gr-name" placeholder="Nombre regla" />
      <select id="gr-scope"><option value="input">input</option><option value="output">output</option></select>
      <input id="gr-pattern" placeholder="Regex" />
      <select id="gr-action"><option value="block">block</option><option value="redact">redact</option></select>
      <input id="gr-msg" placeholder="Mensaje" />
      <button onclick="createGuardrail()">Crear</button>
      <h3>Verificar texto</h3>
      <input id="gr-check" placeholder="Texto a verificar" />
      <button onclick="checkGuardrail()">Verificar</button>
      <pre id="gr-output"></pre>
    </div>`;
}
async function createGuardrail() {
  const r = await api('POST', '/api/guardrails/rules', { name: document.getElementById('gr-name').value, scope: document.getElementById('gr-scope').value, pattern: document.getElementById('gr-pattern').value, action: document.getElementById('gr-action').value, message: document.getElementById('gr-msg').value });
  document.getElementById('gr-output').textContent = JSON.stringify(r.rule, null, 2);
}
async function checkGuardrail() {
  const r = await api('POST', '/api/guardrails/check', { scope: 'output', text: document.getElementById('gr-check').value });
  document.getElementById('gr-output').textContent = JSON.stringify(r.result, null, 2);
}

async function renderTracing(el) {
  el.innerHTML = `
    <h2>🔍 Tracing</h2>
    <div class="card">
      <input id="tr-run" placeholder="run_id" />
      <button onclick="getTrace()">Ver traza</button>
      <pre id="tr-output"></pre>
    </div>`;
}
async function getTrace() {
  const r = await api('GET', '/api/tracing/runs/' + document.getElementById('tr-run').value);
  document.getElementById('tr-output').textContent = JSON.stringify(r.traces, null, 2);
}

async function renderHandoffs(el) {
  el.innerHTML = `
    <h2>🔄 Handoffs</h2>
    <div class="card">
      <input id="ho-ticket" placeholder="ticket_id" />
      <input id="ho-from" placeholder="from_agent" />
      <input id="ho-level" type="number" placeholder="to_level" value="2" />
      <input id="ho-reason" placeholder="reason" />
      <button onclick="escalateTicket()">Escalar</button>
      <pre id="ho-output"></pre>
    </div>`;
}
async function escalateTicket() {
  const r = await api('POST', '/api/handoffs', { ticket_id: document.getElementById('ho-ticket').value, from_agent: document.getElementById('ho-from').value, from_level: 1, to_level: parseInt(document.getElementById('ho-level').value), reason: document.getElementById('ho-reason').value });
  document.getElementById('ho-output').textContent = JSON.stringify(r.handoff, null, 2);
}

async function renderConductorWorkflows(el) {
  el.innerHTML = `
    <h2>⚙️ Conductor-lite Workflows</h2>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-header">Definir workflow DAG</div>
        <input id="wf-name" placeholder="workflow name" value="approval" />
        <textarea id="wf-dag" rows="6">{\n  "steps": [\n    { "id": "request", "action": "ticket.create", "deps": [] },\n    { "id": "approve", "action": "ticket.approve", "deps": ["request"] },\n    { "id": "notify", "action": "email.send", "deps": ["approve"] }\n  ]\n}</textarea>
        <button onclick="createConductorWorkflow()">Definir</button>
        <button class="secondary" onclick="listConductorWorkflows()">Listar</button>
      </div>
      <div class="card">
        <div class="card-header">Ejecutar / inspeccionar run</div>
        <select id="run-wf-id"><option value="">-- seleccionar workflow --</option></select>
        <input id="run-context" value='{"user":"alice"}' />
        <button onclick="startConductorRun()">Iniciar run</button>
        <input id="run-id" placeholder="run id" />
        <button class="secondary" onclick="resumeConductorRun()">Resume</button>
        <button class="secondary" onclick="getConductorRun()">Ver run</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Output</div>
      <pre id="wf-output"></pre>
    </div>`;
  await listConductorWorkflows(true);
}

async function createConductorWorkflow() {
  const r = await api('POST', '/api/conductor/workflows', { name: document.getElementById('wf-name').value, dag: JSON.parse(document.getElementById('wf-dag').value) });
  document.getElementById('wf-output').textContent = JSON.stringify(r.workflow, null, 2);
  await listConductorWorkflows(true);
}

async function listConductorWorkflows(fillSelect = false) {
  const r = await api('GET', '/api/conductor/workflows');
  document.getElementById('wf-output').textContent = JSON.stringify(r.workflows, null, 2);
  if (fillSelect) {
    const sel = document.getElementById('run-wf-id');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- seleccionar workflow --</option>' + (r.workflows || []).map(w => `<option value="${esc(w.id)}">${esc(w.name)} (${w.id.slice(0,8)})</option>`).join('');
  }
}

async function startConductorRun() {
  const wfId = document.getElementById('run-wf-id').value;
  if (!wfId) return alert('Selecciona un workflow');
  const r = await api('POST', `/api/conductor/workflows/${esc(wfId)}/runs`, { context: JSON.parse(document.getElementById('run-context').value || '{}') });
  document.getElementById('wf-output').textContent = JSON.stringify(r, null, 2);
  if (r.run?.runId) document.getElementById('run-id').value = r.run.runId;
}

async function resumeConductorRun() {
  const id = document.getElementById('run-id').value;
  if (!id) return;
  const r = await api('POST', `/api/conductor/runs/${esc(id)}/resume`, {});
  document.getElementById('wf-output').textContent = JSON.stringify(r, null, 2);
}

async function getConductorRun() {
  const id = document.getElementById('run-id').value;
  if (!id) return;
  const r = await api('GET', `/api/conductor/runs/${esc(id)}`);
  document.getElementById('wf-output').textContent = JSON.stringify(r, null, 2);
}

async function renderDurableWorkflows(el) {
  // Backward-compatible alias: Conductor-lite is the new durable workflow UI.
  await renderConductorWorkflows(el);
}

async function renderDurableExecutions(el) {
  el.innerHTML = `
    <h2>🛡️ Durable Executions</h2>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-header">Crear ejecución durable</div>
        <input id="exec-name" placeholder="nombre" value="invoice-pipeline" />
        <textarea id="exec-context" placeholder='{"order_id":"123"}'>{"order_id":"123","amount":500}</textarea>
        <input id="exec-retries" type="number" value="3" />
        <button onclick="createExecution()">Crear</button>
      </div>
      <div class="card">
        <div class="card-header">Eventos y replay</div>
        <input id="exec-id" placeholder="execution id" />
        <input id="exec-event-type" placeholder="event type" value="charge_card" />
        <textarea id="exec-event-payload" placeholder='{}'>{"status":"ok","tx":"tx-1"}</textarea>
        <button onclick="recordExecutionEvent()">Registrar evento</button>
        <button class="secondary" onclick="completeExecution()">Completar</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Ejecuciones</div>
      <button class="secondary" onclick="listExecutions()">Listar</button>
      <div id="exec-list" class="table-wrap"></div>
    </div>
    <pre id="exec-output"></pre>`;
}
async function createExecution() {
  const r = await api('POST', '/api/executions', { name: document.getElementById('exec-name').value, context: JSON.parse(document.getElementById('exec-context').value || '{}'), max_attempts: parseInt(document.getElementById('exec-retries').value || '3') });
  document.getElementById('exec-output').textContent = JSON.stringify(r.execution, null, 2);
  if (r.execution?.id) document.getElementById('exec-id').value = r.execution.id;
  listExecutions();
}
async function listExecutions() {
  const r = await api('GET', '/api/executions');
  const rows = (r.executions || []).map(ex => `
    <tr>
      <td>${ex.id.slice(0,8)}</td>
      <td>${ex.name}</td>
      <td><span class="badge ${ex.status}">${ex.status}</span></td>
      <td>${ex.attempts || 0}</td>
      <td><button class="ghost" onclick="document.getElementById('exec-id').value='${ex.id}'; getExecutionEvents()">Ver</button></td>
    </tr>`).join('');
  document.getElementById('exec-list').innerHTML = `
    <table class="data-table">
      <thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Intentos</th><th>Acción</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Sin ejecuciones</td></tr>'}</tbody>
    </table>`;
}
async function recordExecutionEvent() {
  const id = document.getElementById('exec-id').value;
  const payload = JSON.parse(document.getElementById('exec-event-payload').value || '{}');
  const r = await api('POST', `/api/executions/${id}/events`, { type: document.getElementById('exec-event-type').value, payload });
  document.getElementById('exec-output').textContent = JSON.stringify(r.execution, null, 2);
  listExecutions();
}
async function completeExecution() {
  const id = document.getElementById('exec-id').value;
  const r = await api('POST', `/api/executions/${id}/complete`, { result: JSON.parse(document.getElementById('exec-event-payload').value || '{}') });
  document.getElementById('exec-output').textContent = JSON.stringify(r.execution, null, 2);
  listExecutions();
}
async function getExecutionEvents() {
  const id = document.getElementById('exec-id').value;
  const r = await api('GET', `/api/executions/${id}/events`);
  document.getElementById('exec-output').textContent = JSON.stringify(r.events, null, 2);
}

async function renderA2A(el) {
  el.innerHTML = `
    <h2>🔗 A2A Cards</h2>
    <div class="card">
      <input id="a2a-from" placeholder="from_agent" />
      <input id="a2a-to-tenant" placeholder="to_tenant" />
      <input id="a2a-to-agent" placeholder="to_agent" />
      <input id="a2a-task" placeholder="task_type" />
      <textarea id="a2a-payload" placeholder='{"x":1}'></textarea>
      <button onclick="sendA2A()">Enviar Card</button>
      <button onclick="inboxA2A()">Ver Inbox</button>
      <pre id="a2a-output"></pre>
    </div>`;
}
async function sendA2A() {
  const r = await api('POST', '/api/a2a/cards', { from_agent: document.getElementById('a2a-from').value, to_tenant: document.getElementById('a2a-to-tenant').value, to_agent: document.getElementById('a2a-to-agent').value, task_type: document.getElementById('a2a-task').value, payload: JSON.parse(document.getElementById('a2a-payload').value || '{}') });
  document.getElementById('a2a-output').textContent = JSON.stringify(r.card, null, 2);
}
async function inboxA2A() {
  const r = await api('GET', '/api/a2a/inbox?agent_id=' + document.getElementById('a2a-to-agent').value);
  document.getElementById('a2a-output').textContent = JSON.stringify(r.cards, null, 2);
}

async function renderLocalLLM(el) {
  el.innerHTML = `
    <h2>🖥️ Local LLM Router</h2>
    <div class="card">
      <input id="llm-name" placeholder="model name" value="qwen2.5-coder" />
      <input id="llm-backend" placeholder="backend" value="llama.cpp" />
      <input id="llm-path" placeholder="path" value="models/qwen.gguf" />
      <input id="llm-ctx" type="number" placeholder="context size" value="8192" />
      <button onclick="registerLocalLLM()">Registrar</button>
      <button onclick="routeLocalLLM()">Route</button>
      <pre id="llm-output"></pre>
    </div>`;
}
async function registerLocalLLM() {
  const r = await api('POST', '/api/local-llm/models', { name: document.getElementById('llm-name').value, backend: document.getElementById('llm-backend').value, path: document.getElementById('llm-path').value, context_size: parseInt(document.getElementById('llm-ctx').value), priority: 1 });
  document.getElementById('llm-output').textContent = JSON.stringify(r.model, null, 2);
}
async function routeLocalLLM() {
  const r = await api('POST', '/api/local-llm/route', { text: 'hola mundo' });
  document.getElementById('llm-output').textContent = JSON.stringify(r.route, null, 2);
}

async function renderOTel(el) {
  el.innerHTML = `
    <h2>📡 OTel + Self-Healing</h2>
    <div class="card">
      <input id="otel-trace" placeholder="trace_id" value="trace-1" />
      <input id="otel-service" placeholder="service" value="aaas-router" />
      <input id="otel-op" placeholder="operation" value="generate" />
      <button onclick="startSpan()">Start Span</button>
      <button onclick="failSpan()">Fail Span</button>
      <button onclick="selfHeal()">Self-Heal</button>
      <pre id="otel-output"></pre>
    </div>`;
}
let lastSpanId = null;
async function startSpan() {
  const r = await api('POST', '/api/otel/traces', { trace_id: document.getElementById('otel-trace').value, span_id: 'span-' + Date.now(), service: document.getElementById('otel-service').value, operation: document.getElementById('otel-op').value });
  lastSpanId = r.span.id;
  document.getElementById('otel-output').textContent = JSON.stringify(r.span, null, 2);
}
async function failSpan() {
  if (!lastSpanId) return alert('Primero start span');
  const r = await api('PATCH', '/api/otel/traces/' + lastSpanId, { status: 'error', meta: { reason: 'timeout' } });
  document.getElementById('otel-output').textContent = JSON.stringify(r.updated, null, 2);
}
async function selfHeal() {
  const r = await api('POST', '/api/self-heal', {});
  document.getElementById('otel-output').textContent = JSON.stringify(r.actions, null, 2);
}

async function renderQueue(el) {
  el.innerHTML = `
    <h2>📬 Event Queue</h2>
    <div class="card">
      <input id="q-name" placeholder="queue" value="durable-workflows" />
      <button onclick="listQueue()">Listar Jobs</button>
      <pre id="q-output"></pre>
    </div>`;
}
async function listQueue() {
  const r = await api('GET', '/api/queue/' + document.getElementById('q-name').value);
  document.getElementById('q-output').textContent = JSON.stringify(r.jobs, null, 2);
}

async function renderAgents(el) {
  el.innerHTML = `
    <h2>🤖 Agents Runtime</h2>
    <div class="card">
      <button onclick="bootstrapAgents()">Bootstrap Tenant Agents</button>
      <button onclick="listAgents()">Listar Agents</button>
      <pre id="agents-output"></pre>
    </div>`;
}
async function bootstrapAgents() {
  const r = await api('POST', '/api/agents/bootstrap', {});
  document.getElementById('agents-output').textContent = JSON.stringify(r.agents, null, 2);
}
async function listAgents() {
  const r = await api('GET', '/api/agents');
  document.getElementById('agents-output').textContent = JSON.stringify(r.agents, null, 2);
}

async function renderGateway(el) {
  el.innerHTML = `
    <h2>🚀 AaaS Gateway</h2>
    <div class="card">
      <button onclick="listIntents()">Listar Intents</button>
      <hr/>
      <input id="gw-intent" placeholder="intent (ej ticket.create)" value="ticket.create" />
      <textarea id="gw-payload" placeholder='{"subject":"Test","body":"x"}'>{"requester_email":"a@b.com","requester_name":"A","subject":"Gateway","body":"x"}</textarea>
      <button onclick="invokeGateway()">Invocar Agente</button>
      <pre id="gateway-output"></pre>
    </div>`;
}
async function listIntents() {
  const r = await api('GET', '/api/agents/intents');
  document.getElementById('gateway-output').textContent = r.intents.join('\n');
}
async function invokeGateway() {
  const payload = JSON.parse(document.getElementById('gw-payload').value || '{}');
  const r = await api('POST', '/api/agents/invoke', { intent: document.getElementById('gw-intent').value, payload });
  document.getElementById('gateway-output').textContent = JSON.stringify(r, null, 2);
}


async function renderAgenticRAG(el) {
  el.innerHTML = `
    <h2>🧠 Agentic RAG</h2>
    <div class="card">
      <input id="ar-query" placeholder="query" value="password reset" />
      <button onclick="runAgenticRAG()">Buscar</button>
      <pre id="ar-output"></pre>
    </div>`;
}
async function runAgenticRAG() {
  const r = await api('POST', '/api/rag/agentic', { query: document.getElementById('ar-query').value });
  document.getElementById('ar-output').textContent = JSON.stringify(r, null, 2);
}

async function renderA2AStandard(el) {
  el.innerHTML = `
    <h2>📇 A2A Standard Tasks</h2>
    <div class="card">
      <input id="a2a-sender" placeholder="sender" value="agent-a" />
      <input id="a2a-receiver" placeholder="receiver" value="agent-b" />
      <input id="a2a-payload" placeholder='{"intent":"ticket.create"}' value='{"intent":"ticket.create"}' />
      <button onclick="submitA2ATask()">Submit Task</button>
      <hr/>
      <button onclick="loadA2ATasks()">List Tasks</button>
      <pre id="a2a-output"></pre>
    </div>`;
}
async function submitA2ATask() {
  const payload = JSON.parse(document.getElementById('a2a-payload').value || '{}');
  const r = await api('POST', '/api/a2a/tasks', { sender: document.getElementById('a2a-sender').value, receiver: document.getElementById('a2a-receiver').value, payload });
  document.getElementById('a2a-output').textContent = JSON.stringify(r.task, null, 2);
}
async function loadA2ATasks() {
  const r = await api('GET', '/api/a2a/tasks');
  document.getElementById('a2a-output').textContent = r.tasks.map(t => `${t.task_id}: ${t.status}`).join('\n');
}

async function renderAgentDAG(el) {
  el.innerHTML = `
    <h2>🕸️ Agent DAG</h2>
    <div class="card">
      <textarea id="dag-plan" rows="6" placeholder='[{"id":"1","intent":"ticket.create","deps":[]},{"id":"2","intent":"memory.remember","deps":["1"]}]' rows="6">[{"id":"1","intent":"ticket.create","payload":{"requester_email":"a@b.com","requester_name":"A","subject":"DAG","body":"x"},"deps":[]},{"id":"2","intent":"memory.remember","payload":{"user_id":"u1","content":"ticket created"},"deps":["1"]}]</textarea>
      <button onclick="runDAG()">Run DAG</button>
      <pre id="dag-output"></pre>
    </div>`;
}
async function runDAG() {
  const plan = JSON.parse(document.getElementById('dag-plan').value || '[]');
  const r = await api('POST', '/api/agents/dag', { intent: 'dag.demo', plan });
  document.getElementById('dag-output').textContent = JSON.stringify(r, null, 2);
}

async function renderBrowserAgent(el) {
  el.innerHTML = `
    <h2>🌐 Browser Agent</h2>
    <div class="card">
      <input id="browser-url" placeholder="https://example.com" value="https://example.com" />
      <button onclick="browserNavigate()">Navigate</button>
      <input id="browser-selector" placeholder="h1" value="h1" />
      <button onclick="browserExtract()">Extract Text</button>
      <pre id="browser-output"></pre>
    </div>`;
}
async function browserNavigate() {
  const r = await api('POST', '/api/browser/navigate', { url: document.getElementById('browser-url').value });
  document.getElementById('browser-output').textContent = JSON.stringify(r, null, 2);
}
async function browserExtract() {
  const r = await api('POST', '/api/browser/extract', { selector: document.getElementById('browser-selector').value });
  document.getElementById('browser-output').textContent = JSON.stringify(r, null, 2);
}

async function renderMCPRegistry(el) {
  el.innerHTML = `
    <h2>🔌 MCP Registry</h2>
    <div class="card">
      <input id="mcp-q" placeholder="search" value="" />
      <button onclick="searchMCP()">Search</button>
      <button onclick="installedMCP()">Installed</button>
      <pre id="mcp-output"></pre>
    </div>`;
}
async function searchMCP() {
  const q = document.getElementById('mcp-q').value;
  const r = await api('GET', `/api/mcp/registry${q ? '?q='+encodeURIComponent(q) : ''}`);
  document.getElementById('mcp-output').textContent = r.servers.map(s => `${s.id} ${s.name}`).join('\n');
}
async function installedMCP() {
  const r = await api('GET', '/api/mcp/registry/installed');
  document.getElementById('mcp-output').textContent = r.servers.map(s => `${s.id} ${s.name}`).join('\n');
}

async function renderBillingCiclo3(el) {
  el.innerHTML = `
    <h2>💰 Billing Ciclo 3</h2>
    <div class="card">
      <button onclick="loadCiclo3Usage()">Usage</button>
      <button onclick="loadCiclo3Invoice()">Invoice</button>
      <pre id="billing-c3-output"></pre>
    </div>`;
}
async function loadCiclo3Usage() {
  const r = await api('GET', '/api/billing/usage');
  document.getElementById('billing-c3-output').textContent = JSON.stringify(r, null, 2);
}
async function loadCiclo3Invoice() {
  const r = await api('GET', '/api/billing/invoice');
  document.getElementById('billing-c3-output').textContent = JSON.stringify(r, null, 2);
}

async function renderMCPTools(el) {
  el.innerHTML = `
    <h2>🛠️ MCP Tools</h2>
    <div class="card">
      <button onclick="listMCPTools()">Listar Tools</button>
      <hr/>
      <select id="mcp-tool-name">
        <option value="create_ticket">create_ticket</option>
        <option value="list_tickets">list_tickets</option>
        <option value="remember">remember</option>
        <option value="recall">recall</option>
        <option value="hybrid_search">hybrid_search</option>
        <option value="route_local_llm">route_local_llm</option>
        <option value="send_a2a_card">send_a2a_card</option>
      </select>
      <textarea id="mcp-tool-args" placeholder='{"requester_email":"a@b.com","requester_name":"A","subject":"MCP","body":"x"}'>{"requester_email":"a@b.com","requester_name":"A","subject":"MCP","body":"x"}</textarea>
      <button onclick="callMCPTool()">Call Tool</button>
      <pre id="mcp-tools-output"></pre>
    </div>`;
}
async function listMCPTools() {
  const r = await api('POST', '/api/mcp', { method: 'tools/list', id: 1, params: {} });
  document.getElementById('mcp-tools-output').textContent = r.result.tools.map(t => t.name).join('\n');
}
async function callMCPTool() {
  const name = document.getElementById('mcp-tool-name').value;
  const args = JSON.parse(document.getElementById('mcp-tool-args').value || '{}');
  const r = await api('POST', '/api/mcp', { method: 'tools/call', id: 2, params: { name, arguments: args } });
  document.getElementById('mcp-tools-output').textContent = JSON.stringify(r, null, 2);
}

async function renderMCPGateway(el) {
  el.innerHTML = `
    <h2>🔌 MCP Gateway + Billing</h2>
    <div class="card">
      <div class="form-row">
        <select id="mcp-gw-server">
          <option value="github">GitHub MCP</option>
          <option value="slack">Slack MCP</option>
          <option value="notion">Notion MCP</option>
          <option value="google-calendar">Google Calendar MCP</option>
        </select>
        <input id="mcp-gw-tool" placeholder="tool name" value="create_issue" />
        <input id="mcp-gw-rpm" type="number" placeholder="rate limit rpm" value="60" />
        <input id="mcp-gw-cost" type="number" step="0.001" placeholder="cost per call" value="0.05" />
      </div>
      <button onclick="registerMCPGatewayTool()">Registrar Tool</button>
    </div>
    <div class="card">
      <button onclick="listMCPGatewayTools()">Listar Tools</button>
      <button onclick="loadMCPGatewayTotals()">Totales por Tool</button>
      <pre id="mcp-gw-list"></pre>
    </div>
    <div class="card">
      <input id="mcp-gw-tool-id" placeholder="tool id" />
      <textarea id="mcp-gw-input" placeholder='{"repo":"acme/repo"}'>{"repo":"acme/repo"}</textarea>
      <button onclick="callMCPGatewayTool()">Ejecutar Tool</button>
      <pre id="mcp-gw-output"></pre>
    </div>`;
}
async function registerMCPGatewayTool() {
  const r = await api('POST', '/api/mcp/gateway/tools', {
    server_id: document.getElementById('mcp-gw-server').value,
    tool_name: document.getElementById('mcp-gw-tool').value,
    rate_limit_rpm: parseInt(document.getElementById('mcp-gw-rpm').value),
    cost_per_call: parseFloat(document.getElementById('mcp-gw-cost').value),
    metadata: { category: 'mcp', registered_via: 'ui' }
  });
  document.getElementById('mcp-gw-output').textContent = JSON.stringify(r, null, 2);
  await listMCPGatewayTools();
}

async function listMCPGatewayTools() {
  const r = await api('GET', '/api/mcp/gateway/tools');
  const rows = (r.tools || []).map(t => `
    <tr>
      <td>${esc(t.server_id)}</td>
      <td>${esc(t.tool_name)}</td>
      <td>${t.rate_limit_rpm} rpm</td>
      <td>$${t.cost_per_call.toFixed(3)}</td>
      <td><span class="badge ${t.enabled ? 'success' : 'muted'}">${t.enabled ? 'on' : 'off'}</span></td>
      <td><button class="ghost" onclick="document.getElementById('mcp-gw-tool-id').value='${esc(t.id)}';">Usar</button>
        <button class="ghost danger" onclick="deleteMCPGatewayTool('${esc(t.id)}')">🗑️</button></td>
    </tr>`).join('');
  document.getElementById('mcp-gw-list').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Server</th><th>Tool</th><th>Rate</th><th>Cost/call</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Sin tools</td></tr>'}</tbody>
    </table>`;
}

async function deleteMCPGatewayTool(id) {
  if (!confirm('¿Eliminar tool?')) return;
  const r = await api('DELETE', `/api/mcp/gateway/tools/${id}`);
  document.getElementById('mcp-gw-output').textContent = JSON.stringify(r, null, 2);
  await listMCPGatewayTools();
}

async function toggleMCPGatewayTool(id, enabled) {
  const r = await api('PATCH', `/api/mcp/gateway/tools/${id}`, { enabled });
  document.getElementById('mcp-gw-output').textContent = JSON.stringify(r, null, 2);
  await listMCPGatewayTools();
}

async function callMCPGatewayTool() {
  const r = await api('POST', '/api/mcp/gateway/call', {
    tool_id: document.getElementById('mcp-gw-tool-id').value,
    input: JSON.parse(document.getElementById('mcp-gw-input').value || '{}')
  });
  document.getElementById('mcp-gw-output').textContent = JSON.stringify(r, null, 2);
  await loadMCPGatewayTotals();
}

async function loadMCPGatewayTotals() {
  const r = await api('GET', '/api/mcp/gateway/totals');
  const rows = (r.totals || []).map(t => `
    <tr>
      <td>${esc(t.server_id)}</td>
      <td>${esc(t.tool_name)}</td>
      <td>${t.calls}</td>
      <td>$${(t.total_cost || 0).toFixed(3)}</td>
    </tr>`).join('');
  document.getElementById('mcp-gw-list').innerHTML += `
    <h3>Totales por tool</h3>
    <table class="data-table">
      <thead><tr><th>Server</th><th>Tool</th><th>Llamadas</th><th>Costo total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody>
    </table>`;
}

if (token) show('dashboard');

async function renderPolicyEngine(el) {
  el.innerHTML = `
    <h2>🛡️ Agent Policy Engine</h2>
    <div class="card">
      <input id="pe-name" placeholder="Policy name" value="Bloquear MCP costoso" />
      <input id="pe-resource" placeholder="resource" value="mcp" />
      <input id="pe-action" placeholder="action" value="tools/call" />
      <input id="pe-effect" placeholder="allow|deny" value="deny" />
      <textarea id="pe-conditions" placeholder='{"gte":{"agent.level":5}}'>\{"gte":{"agent.level":5},"gt":{"cost_estimate":1.0}}</textarea>
      <button onclick="createPolicy()">Crear</button>
      <button onclick="listPolicies()">Listar</button>
      <button onclick="decidePolicy()">Decidir</button>
      <pre id="pe-output"></pre>
    </div>`;
}
async function createPolicy() {
  const r = await api('POST', '/api/policies', { name: document.getElementById('pe-name').value, resource: document.getElementById('pe-resource').value, action: document.getElementById('pe-action').value, effect: document.getElementById('pe-effect').value, conditions: JSON.parse(document.getElementById('pe-conditions').value), priority: 100 });
  document.getElementById('pe-output').textContent = JSON.stringify(r, null, 2);
}
async function listPolicies() {
  const r = await api('GET', '/api/policies');
  document.getElementById('pe-output').textContent = r.policies.map(p => `${p.name} (${p.effect}) ${p.id.slice(0,8)}`).join('\\n');
}
async function decidePolicy() {
  const ctx = { agent: { level: 5 }, cost_estimate: 1.5 };
  const r = await api('POST', '/api/policies/decide', { resource: 'mcp', action: 'tools/call', context: ctx });
  document.getElementById('pe-output').textContent = JSON.stringify(r, null, 2);
}

async function renderSandbox(el) {
  el.innerHTML = `
    <h2>🔒 Agent Sandbox</h2>
    <div class="card">
      <input id="sb-agent" placeholder="agent_id" value="agent-demo" />
      <input id="sb-tools" placeholder="allowed tools comma" value="read,calc" />
      <button onclick="createSandbox()">Crear + Start</button>
      <hr/>
      <input id="sb-id" placeholder="sandbox id" />
      <input id="sb-tool" placeholder="tool" value="calc" />
      <textarea id="sb-args" placeholder='{}'>\{"expr":"1+1"}</textarea>
      <button onclick="execSandbox()">Ejecutar</button>
      <button onclick="stopSandbox()">Stop</button>
      <pre id="sb-output"></pre>
    </div>`;
}
let lastSandboxId = null;
async function createSandbox() {
  const r = await api('POST', '/api/sandboxes', { agent_id: document.getElementById('sb-agent').value, allowed_tools: document.getElementById('sb-tools').value.split(','), resource_limits: { max_ms: 5000 } });
  lastSandboxId = r.sandbox.id;
  document.getElementById('sb-id').value = lastSandboxId;
  await api('PATCH', `/api/sandboxes/${lastSandboxId}/start`);
  document.getElementById('sb-output').textContent = JSON.stringify(r, null, 2);
}
async function execSandbox() {
  const id = document.getElementById('sb-id').value;
  const r = await api('PATCH', `/api/sandboxes/${id}/execute`, { tool: document.getElementById('sb-tool').value, args: JSON.parse(document.getElementById('sb-args').value) });
  document.getElementById('sb-output').textContent = JSON.stringify(r, null, 2);
}
async function stopSandbox() {
  const id = document.getElementById('sb-id').value;
  const r = await api('PATCH', `/api/sandboxes/${id}/stop`, { result: { ok: true } });
  document.getElementById('sb-output').textContent = JSON.stringify(r, null, 2);
}

async function renderCausalAlerts(el) {
  el.innerHTML = `
    <h2>🚨 Causal Alerts</h2>
    <div class="card">
      <input id="ca-metric" placeholder="metric" value="cpu" />
      <input id="ca-source" placeholder="source" value="agent-1" />
      <input id="ca-value" type="number" placeholder="value" value="35" />
      <button onclick="ingestAlert()">Ingestar</button>
      <button onclick="listAlerts()">Listar abiertas</button>
      <pre id="ca-output"></pre>
    </div>`;
}
async function ingestAlert() {
  const r = await api('POST', '/api/causal-alerts/ingest', { metric: document.getElementById('ca-metric').value, source: document.getElementById('ca-source').value, value: Number(document.getElementById('ca-value').value) });
  document.getElementById('ca-output').textContent = JSON.stringify(r, null, 2);
}
async function listAlerts() {
  const r = await api('GET', '/api/causal-alerts?status=open');
  document.getElementById('ca-output').textContent = r.alerts.map(a => `${a.severity} ${a.metric} ${a.source} z=${a.z_score.toFixed(2)}`).join('\\n');
}

async function renderRemediation(el) {
  el.innerHTML = `
    <h2>🩹 Remediation DSL</h2>
    <div class="card">
      <input id="rem-name" placeholder="rule name" value="CPU spike → notify" />
      <input id="rem-trigger" placeholder="trigger" value="cpu.spike" />
      <textarea id="rem-condition" placeholder='{}'>\{"severity":"critical"}</textarea>
      <textarea id="rem-actions" placeholder='[]'>[{"type":"notify","args":{"channel":"slack"}},{"type":"noop","args":{}}]</textarea>
      <button onclick="createRemediation()">Crear</button>
      <button onclick="runRemediation()">Run</button>
      <button onclick="listRemediation()">Listar</button>
      <pre id="rem-output"></pre>
    </div>`;
}
let lastRemediationId = null;
async function createRemediation() {
  const r = await api('POST', '/api/remediation/rules', { name: document.getElementById('rem-name').value, trigger: document.getElementById('rem-trigger').value, condition: JSON.parse(document.getElementById('rem-condition').value), actions: JSON.parse(document.getElementById('rem-actions').value), enabled: true });
  lastRemediationId = r.rule.id;
  document.getElementById('rem-output').textContent = JSON.stringify(r, null, 2);
}
async function runRemediation() {
  const id = lastRemediationId || prompt('rule id');
  const r = await api('POST', `/api/remediation/rules/${id}/run`, { alert_id: 'alert-1', context: { severity: 'critical' } });
  document.getElementById('rem-output').textContent = JSON.stringify(r, null, 2);
}
async function listRemediation() {
  const r = await api('GET', '/api/remediation/rules');
  document.getElementById('rem-output').textContent = r.rules.map(x => x.name).join('\\n');
}

async function renderFailurePrediction(el) {
  el.innerHTML = `
    <h2>🔮 AI-Driven Failure Prediction + Self-Healing</h2>
    <div class="card">
      <button onclick="scanFailurePrediction()">Scan Tenant</button>
      <button onclick="listFailurePredictions()">Predicciones</button>
      <button onclick="recordFailureSignal()">Inyectar Señal</button>
      <button class="secondary" onclick="runSelfHealing()">🩹 Auto-Remediar</button>
      <button class="secondary" onclick="listHealingActions()">Acciones de healing</button>
      <pre id="fp-output"></pre>
    </div>
    <div class="card">
      <input id="fp-entity-type" placeholder="entity_type" value="ticket" />
      <input id="fp-entity-id" placeholder="entity_id" value="TK-42" />
      <select id="fp-signal-type">
        <option value="error_rate">error_rate</option>
        <option value="latency_p95">latency_p95</option>
        <option value="open_tickets">open_tickets</option>
        <option value="overdue_ratio">overdue_ratio</option>
        <option value="sentiment_negative">sentiment_negative</option>
      </select>
      <input id="fp-value" type="number" step="0.01" placeholder="value" value="0.85" />
      <input id="fp-threshold" type="number" step="0.01" placeholder="threshold" value="0.7" />
      <button onclick="predictFailure()">Predecir</button>
      <pre id="fp-predict"></pre>
    </div>
    <div class="card">
      <div class="card-header">Acciones de healing pendientes</div>
      <div id="healing-list" class="table-wrap"></div>
    </div>`;
  await listHealingActions();
}

async function runSelfHealing() {
  const r = await api('POST', '/api/self-healing/heal', {});
  document.getElementById('fp-output').textContent = JSON.stringify(r, null, 2);
  await listHealingActions();
}

async function applyHealingAction(id) {
  const r = await api('POST', `/api/self-healing/actions/${id}`, {});
  document.getElementById('fp-output').textContent = JSON.stringify(r, null, 2);
  await listHealingActions();
}

async function listHealingActions() {
  const r = await api('GET', '/api/self-healing/actions');
  const rows = (r.actions || []).map(a => `
    <tr>
      <td>${esc(a.action)}</td>
      <td>${esc(a.target_type)} · ${esc(a.symptom)}</td>
      <td><button class="ghost" onclick="applyHealingAction('${esc(a.id)}')">Aplicar</button></td>
    </tr>`).join('');
  document.getElementById('healing-list').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Acción</th><th>Objetivo · Síntoma</th><th>Aplicar</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3">Sin acciones</td></tr>'}</tbody>
    </table>`;
}

async function scanFailurePrediction() {
  const r = await api('POST', '/api/failure-prediction/scan', {});
  document.getElementById('fp-output').textContent = JSON.stringify(r, null, 2);
}
async function listFailurePredictions() {
  const r = await api('GET', '/api/failure-prediction/predictions');
  document.getElementById('fp-output').textContent = JSON.stringify(r.predictions.slice(0, 10), null, 2);
}
async function recordFailureSignal() {
  const r = await api('POST', '/api/failure-prediction/signals', {
    signal_type: document.getElementById('fp-signal-type').value,
    entity_type: document.getElementById('fp-entity-type').value,
    entity_id: document.getElementById('fp-entity-id').value,
    value: parseFloat(document.getElementById('fp-value').value),
    threshold: parseFloat(document.getElementById('fp-threshold').value)
  });
  document.getElementById('fp-predict').textContent = JSON.stringify(r, null, 2);
}
async function predictFailure() {
  const r = await api('POST', '/api/failure-prediction/predict', {
    entity_type: document.getElementById('fp-entity-type').value,
    entity_id: document.getElementById('fp-entity-id').value,
    signals: [{
      signal_type: document.getElementById('fp-signal-type').value,
      value: parseFloat(document.getElementById('fp-value').value),
      threshold: parseFloat(document.getElementById('fp-threshold').value)
    }]
  });
  document.getElementById('fp-predict').textContent = JSON.stringify(r, null, 2);
}

async function renderReBAC(el) {
  el.innerHTML = `
    <h2>🔐 ReBAC + ABAC — Unified AuthZ</h2>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-header">ReBAC Tuple (Zanzibar-lite)</div>
        <input id="rebac-obj-type" placeholder="object_type" value="document" />
        <input id="rebac-obj-id" placeholder="object_id" value="doc-1" />
        <input id="rebac-relation" placeholder="relation" value="viewer" />
        <input id="rebac-user-type" placeholder="user_type" value="user" />
        <input id="rebac-user-id" placeholder="user_id" value="u-1" />
        <div class="form-row">
          <button onclick="writeReBAC()">Write Tuple</button>
          <button onclick="deleteReBAC()">Delete Tuple</button>
          <button onclick="expandReBAC()">Expand</button>
          <button onclick="checkReBAC()">Check</button>
          <button onclick="snapshotReBAC()">Snapshot</button>
        </div>
        <pre id="rebac-output"></pre>
      </div>
      <div class="card">
        <div class="card-header">ABAC Policy Builder</div>
        <input id="abac-name" placeholder="policy name" value="support-read" />
        <input id="abac-resource" placeholder="resource" value="ticket" />
        <input id="abac-action" placeholder="action" value="read" />
        <select id="abac-effect">
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
        <input id="abac-priority" type="number" placeholder="priority" value="10" />
        <textarea id="abac-conditions" rows="4" placeholder='{"subject.role":["admin","agent"]}'>{"subject.role":["admin","agent"]}</textarea>
        <button onclick="createABACPolicy()">Crear política</button>
        <button onclick="listABACPolicies()">Listar</button>
        <pre id="abac-output"></pre>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Evaluación unificada</div>
      <input id="eval-resource" placeholder="resource" value="ticket" />
      <input id="eval-action" placeholder="action" value="read" />
      <textarea id="eval-subject" placeholder='{"role":"agent","department":"support"}'>{"role":"agent","department":"support"}</textarea>
      <button onclick="evaluateABAC()">Evaluar ABAC</button>
      <button onclick="checkReBAC()">Evaluar ReBAC</button>
      <pre id="eval-output"></pre>
    </div>
    <div class="card">
      <button onclick="listReBAC()">Listar Tuples ReBAC</button>
      <div id="rebac-list" class="table-wrap"></div>
    </div>`;
}

async function createABACPolicy() {
  const r = await api('POST', '/api/abac/policies', {
    name: document.getElementById('abac-name').value,
    resource: document.getElementById('abac-resource').value,
    action: document.getElementById('abac-action').value,
    effect: document.getElementById('abac-effect').value,
    priority: parseInt(document.getElementById('abac-priority').value || '0'),
    conditions: JSON.parse(document.getElementById('abac-conditions').value || '{}')
  });
  document.getElementById('abac-output').textContent = JSON.stringify(r, null, 2);
}

async function listABACPolicies() {
  const r = await api('GET', '/api/abac/policies');
  const rows = (r.policies || []).map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.resource)}:${esc(p.action)}</td>
      <td><span class="badge ${p.effect}">${p.effect}</span></td>
      <td>${p.priority}</td>
      <td><pre>${esc(JSON.stringify(p.conditions))}</pre></td>
    </tr>`).join('');
  document.getElementById('abac-output').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Nombre</th><th>Recurso:Acción</th><th>Efecto</th><th>Prioridad</th><th>Condiciones</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Sin políticas</td></tr>'}</tbody>
    </table>`;
}

async function evaluateABAC() {
  const r = await api('POST', '/api/abac/evaluate', {
    resource: document.getElementById('eval-resource').value,
    action: document.getElementById('eval-action').value,
    subject: JSON.parse(document.getElementById('eval-subject').value || '{}')
  });
  document.getElementById('eval-output').textContent = JSON.stringify(r, null, 2);
}

async function writeReBAC() {
  const r = await api('POST', '/api/authz/tuples', {
    object_type: document.getElementById('rebac-obj-type').value,
    object_id: document.getElementById('rebac-obj-id').value,
    relation: document.getElementById('rebac-relation').value,
    user_type: document.getElementById('rebac-user-type').value,
    user_id: document.getElementById('rebac-user-id').value
  });
  document.getElementById('rebac-output').textContent = JSON.stringify(r, null, 2);
}
async function deleteReBAC() {
  const r = await api('DELETE', '/api/authz/tuples', {
    object_type: document.getElementById('rebac-obj-type').value,
    object_id: document.getElementById('rebac-obj-id').value,
    relation: document.getElementById('rebac-relation').value,
    user_type: document.getElementById('rebac-user-type').value,
    user_id: document.getElementById('rebac-user-id').value
  });
  document.getElementById('rebac-output').textContent = JSON.stringify(r, null, 2);
}
async function expandReBAC() {
  const ot = document.getElementById('rebac-obj-type').value;
  const oi = document.getElementById('rebac-obj-id').value;
  const rel = document.getElementById('rebac-relation').value;
  const r = await api('GET', `/api/authz/expand?object_type=${ot}&object_id=${oi}&relation=${rel}`);
  document.getElementById('rebac-output').textContent = JSON.stringify(r, null, 2);
}
async function checkReBAC() {
  const r = await api('POST', '/api/authz/check', {
    object_type: document.getElementById('rebac-obj-type').value,
    object_id: document.getElementById('rebac-obj-id').value,
    relation: document.getElementById('rebac-relation').value,
    user_type: document.getElementById('rebac-user-type').value,
    user_id: document.getElementById('rebac-user-id').value
  });
  document.getElementById('rebac-check').textContent = JSON.stringify(r, null, 2);
}
async function snapshotReBAC() {
  const r = await api('POST', '/api/authz/snapshot', {
    object_type: document.getElementById('rebac-obj-type').value,
    object_id: document.getElementById('rebac-obj-id').value
  });
  document.getElementById('rebac-check').textContent = JSON.stringify(r, null, 2);
}
async function listReBAC() {
  const r = await api('GET', '/api/authz/tuples');
  document.getElementById('rebac-check').textContent = JSON.stringify(r.tuples.slice(0, 10), null, 2);
}

async function renderAgentCost(el) {
  el.innerHTML = `
    <h2>💸 Agent Cost Attribution</h2>
    <div class="card">
      <input id="cost-resource" placeholder="resource" value="agent.invoke" />
      <input id="cost-agent" placeholder="agent_id" value="agent-a" />
      <input id="cost-metric" placeholder="metric" value="agent.invocation" />
      <input id="cost-qty" type="number" placeholder="quantity" value="10" />
      <button onclick="recordCharge()">Registrar cargo</button>
      <button onclick="costSummary()">Resumen</button>
      <button onclick="costEstimate()">Estimar LLM</button>
      <pre id="cost-output"></pre>
    </div>`;
}
async function recordCharge() {
  const r = await api('POST', '/api/costs/charges', { resource: document.getElementById('cost-resource').value, agent_id: document.getElementById('cost-agent').value, metric: document.getElementById('cost-metric').value, quantity: Number(document.getElementById('cost-qty').value) });
  document.getElementById('cost-output').textContent = JSON.stringify(r, null, 2);
}
async function costSummary() {
  const r = await api('GET', '/api/costs/totals');
  document.getElementById('cost-output').textContent = JSON.stringify(r, null, 2);
}
async function costEstimate() {
  const r = await api('POST', '/api/costs/estimate', { input_tokens: 2000, output_tokens: 500, model: 'qwen' });
  document.getElementById('cost-output').textContent = JSON.stringify(r, null, 2);
}

async function renderAgentTracing(el) {
  el.innerHTML = `
    <h2>📊 Agent Tracing (OpenTelemetry)</h2>
    <div class="card">
      <h3>Iniciar Span</h3>
      <div class="form-row">
        <input id="trace-id" placeholder="Trace ID (opcional)" value="" />
        <input id="parent-span-id" placeholder="Parent Span ID (opcional)" value="" />
        <input id="agent-id" placeholder="Agent ID (opcional)" value="" />
        <input id="agent-type" placeholder="Agent Type (opcional)" value="" />
        <input id="operation" placeholder="Operación (requerido)" value="llm_call" />
        <select id="model-provider">
          <option value="">-- Seleccionar Proveedor (opcional) --</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google</option>
          <option value="ollama">Ollama</option>
          <option value="local">Local</option>
        </select>
        <input id="model-name" placeholder="Model Name (opcional)" value="" />
        <input id="input-tokens" type="number" placeholder="Input Tokens" value="0" />
        <input id="output-tokens" type="number" placeholder="Output Tokens" value="0" />
        <textarea id="attributes" rows="2" placeholder="Attributes (JSON, opcional)">{} </textarea>
      </div>
      <button onclick="startAgentSpan()">Iniciar Span</button>
    </div>
    <div class="card">
      <h3>Finalizar Span</h3>
      <div class="form-row">
        <input id="end-span-id" placeholder="Span ID a finalizar" value="" />
        <select id="end-status">
          <option value="completed">Completado</option>
          <option value="error">Error</option>
        </select>
        <textarea id="end-attributes" rows="2" placeholder="Attributes (JSON, opcional)">{} </textarea>
      </div>
      <button onclick="endAgentSpan()">Finalizar Span</button>
    </div>
    <div class="card">
      <h3>Consultar Traces</h3>
      <div class="form-row">
        <input id="trace-id-get" placeholder="Trace ID (opcional)" value="" />
        <input id="limit" type="number" placeholder="Límite" value="100" />
      </div>
      <button onclick="getAgentTraces()">Obtener Traces</button>
    </div>
    <div class="card">
      <h3>Actualizar Coste de Modelo</h3>
      <div class="form-row">
        <input id="model-cost-provider" placeholder="Proveedor" value="" />
        <input id="model-cost-name" placeholder="Nombre del Modelo" value="" />
        <input id="model-cost-input" type="number" placeholder="Costo de entrada por 1K tokens" value="0" />
        <input id="model-cost-output" type="number" placeholder="Costo de salida por 1K tokens" value="0" />
        <select id="model-cost-currency">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="MXN">MXN</option>
        </select>
      </div>
      <button onclick="upsertAgentModelCost()">Actualizar Coste</button>
    </div>
    <div class="card">
      <h3>Resultado</h3>
      <pre id="trace-result"></pre>
    </div>
  `;
}

function startAgentSpan() {
  const traceId = document.getElementById('trace-id').value || undefined;
  const parentSpanId = document.getElementById('parent-span-id').value || undefined;
  const agentId = document.getElementById('agent-id').value || undefined;
  const agentType = document.getElementById('agent-type').value || undefined;
  const operation = document.getElementById('operation').value;
  const modelProvider = document.getElementById('model-provider').value || undefined;
  const modelName = document.getElementById('model-name').value || undefined;
  const inputTokens = parseInt(document.getElementById('input-tokens').value) || 0;
  const outputTokens = parseInt(document.getElementById('output-tokens').value) || 0;
  const attributesStr = document.getElementById('attributes').value;
  let attributes = {};
  try {
    attributes = attributesStr ? JSON.parse(attributesStr) : {};
  } catch (e) {
    alert('Attributes must be valid JSON');
    return;
  }
  if (!operation) {
    alert('Operation is required');
    return;
  }
  api('POST', '/api/traces/start', {
    trace_id: traceId,
    parent_span_id: parentSpanId,
    tenant_id: getCookie('tenant_id'), // assuming we have a way to get tenant_id
    agent_id: agentId,
    agent_type: agentType,
    operation: operation,
    model_provider: modelProvider,
    model_name: modelName,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    attributes: attributes
  }).then(r => {
    document.getElementById('trace-result').textContent = JSON.stringify(r, null, 2);
  });
}

function endAgentSpan() {
  const spanId = document.getElementById('end-span-id').value;
  const status = document.getElementById('end-status').value;
  const attributesStr = document.getElementById('end-attributes').value;
  let attributes = {};
  try {
    attributes = attributesStr ? JSON.parse(attributesStr) : {};
  } catch (e) {
    alert('Attributes must be valid JSON');
    return;
  }
  if (!spanId) {
    alert('Span ID is required');
    return;
  }
  api('POST', '/api/traces/end', {
    span_id: spanId,
    status: status,
    attributes: attributes
  }).then(r => {
    document.getElementById('trace-result').textContent = JSON.stringify(r, null, 2);
  });
}

function getAgentTraces() {
  const traceId = document.getElementById('trace-id-get').value;
  const limit = document.getElementById('limit').value;
  const params = new URLSearchParams();
  if (traceId) params.append('trace_id', traceId);
  if (limit) params.append('limit', limit);
  // We'll need to get tenant_id from somewhere, for now we'll assume it's in a cookie or we can get from /api/tenant
  api('GET', `/api/traces?${params.toString()}`).then(r => {
    document.getElementById('trace-result').textContent = JSON.stringify(r, null, 2);
  });
}

function upsertAgentModelCost() {
  const provider = document.getElementById('model-cost-provider').value;
  const modelName = document.getElementById('model-cost-name').value;
  const inputCost = parseFloat(document.getElementById('model-cost-input').value);
  const outputCost = parseFloat(document.getElementById('model-cost-output').value);
  const currency = document.getElementById('model-cost-currency').value;
  if (!provider || !modelName || isNaN(inputCost) || isNaN(outputCost)) {
    alert('Provider, Model Name, Input Cost, and Output Cost are required');
    return;
  }
  api('POST', '/api/traces/model-cost', {
    provider: provider,
    model_name: modelName,
    input_cost_per_1k: inputCost,
    output_cost_per_1k: outputCost,
    currency: currency
  }).then(r => {
    document.getElementById('trace-result').textContent = JSON.stringify(r, null, 2);
  });
}

// Helper function to get cookie (simplified)
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

async function renderLLMCache(el) {
  if (!el) return;
  el.innerHTML = `
    <h2>🧠 LLM Cache &amp; Reasoning Effort</h2>
    <p class="muted">Prompt cache determinístico (SHA-256) + control de reasoning effort (none/low/medium/high). Compatible con Anthropic prompt caching y OpenAI o1-style reasoning. Reduce costos de LLM hasta 90% en prompts repetitivos.</p>
    <div class="grid two">
      <section>
        <h3>Cache Stats</h3>
        <div id="llm-cache-totals">Cargando...</div>
        <div id="llm-cache-table"></div>
        <button class="btn" onclick="loadLLMCacheStats()">↻ Refrescar</button>
        <button class="btn danger" onclick="invalidateLLMCache()">🗑️ Invalidar todo</button>
        <button class="btn" onclick="cleanupLLMCache()">🧹 Cleanup expirados</button>
      </section>
      <section>
        <h3>Test Generate (con cache + reasoning)</h3>
        <label>Prompt <textarea id="llm-cache-prompt" rows="3">¿Cuál es el SLA?</textarea></label>
        <label>Strategy
          <select id="llm-cache-strategy">
            <option>balanced</option><option>cheap</option><option>fast</option><option>quality</option>
          </select>
        </label>
        <label>Reasoning effort
          <select id="llm-cache-reasoning">
            <option>none</option><option>low</option><option>medium</option><option>high</option>
          </select>
        </label>
        <label><input type="checkbox" id="llm-cache-use" checked> Usar cache</label>
        <button class="btn primary" onclick="testLLMGenerate()">▶ Generar</button>
        <pre id="llm-cache-result" class="result">—</pre>
      </section>
    </div>
  `;
  loadLLMCacheStats();
}

async function loadLLMCacheStats() {
  try {
    const r = await api('GET', '/api/llm/cache/stats?days=7');
    const totals = r.totals || {};
    document.getElementById('llm-cache-totals').innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><b>${totals.hits || 0}</b><span>Hits</span></div>
        <div class="kpi"><b>${totals.misses || 0}</b><span>Misses</span></div>
        <div class="kpi"><b>${(totals.hit_rate * 100 || 0).toFixed(1)}%</b><span>Hit rate</span></div>
        <div class="kpi"><b>${totals.tokens_saved || 0}</b><span>Tokens saved</span></div>
        <div class="kpi"><b>$${(totals.cost_saved || 0).toFixed(4)}</b><span>Cost saved</span></div>
      </div>
    `;
    const rows = (r.stats || []).map(s => `<tr><td>${s.day}</td><td>${s.hits}</td><td>${s.misses}</td><td>${s.tokens_saved}</td><td>$${(s.cost_saved || 0).toFixed(4)}</td></tr>`).join('');
    document.getElementById('llm-cache-table').innerHTML = `
      <table class="data"><thead><tr><th>Día</th><th>Hits</th><th>Misses</th><th>Tokens</th><th>USD</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">Sin datos aún</td></tr>'}</tbody></table>
    `;
  } catch (e) {
    document.getElementById('llm-cache-totals').textContent = 'Error: ' + e.message;
  }
}

async function testLLMGenerate() {
  const prompt = document.getElementById('llm-cache-prompt').value;
  const strategy = document.getElementById('llm-cache-strategy').value;
  const reasoning = document.getElementById('llm-cache-reasoning').value;
  const useCache = document.getElementById('llm-cache-use').checked;
  const out = document.getElementById('llm-cache-result');
  out.textContent = '⏳ Generando...';
  try {
    const r = await api('POST', '/api/llm/generate', { prompt, strategy, reasoning, useCache });
    out.textContent = JSON.stringify(r, null, 2);
    loadLLMCacheStats();
  } catch (e) {
    out.textContent = '❌ ' + e.message;
  }
}

async function invalidateLLMCache() {
  if (!confirm('¿Invalidar toda la cache del tenant?')) return;
  const r = await api('POST', '/api/llm/cache/invalidate', {});
  alert(`Eliminadas: ${r.removed}`);
  loadLLMCacheStats();
}

async function cleanupLLMCache() {
  const r = await api('POST', '/api/llm/cache/cleanup', {});
  alert(`Expiradas eliminadas: ${r.removed}`);
  loadLLMCacheStats();
}

// ===== MCP 1.0 Server (Streamable-HTTP) =====
async function renderMCPServer(el) {
  if (!el) return;
  let sessionId = null;
  el.innerHTML = `
    <h2>🔌 MCP Server 1.0 — Streamable-HTTP</h2>
    <p class="muted">AzurDesk AI expuesto como servidor MCP 1.0 (spec 2025-11-25). Compatible con Claude Desktop, Cursor, Cline, Continue.dev, Zed. Endpoint único <code>POST /mcp</code> con JSON-RPC 2.0, transporte streamable-HTTP y sesiones con <code>Mcp-Session-Id</code>.</p>
    <div class="grid two">
      <section>
        <h3>1. Server Info</h3>
        <div id="mcp-server-info">Cargando...</div>
        <button class="btn" onclick="loadMCPInfo()">↻ Refrescar info</button>
      </section>
      <section>
        <h3>2. Initialize (handshake)</h3>
        <p class="muted">Inicia sesión MCP y devuelve <code>sessionId</code>.</p>
        <button class="btn primary" onclick="mcpInitialize()">▶ initialize</button>
        <div id="mcp-init-result" class="result">—</div>
      </section>
      <section>
        <h3>3. tools/list</h3>
        <p class="muted">Lista de tools disponibles (subset de capabilities del server).</p>
        <button class="btn" onclick="mcpToolsList()">📋 listar tools</button>
        <pre id="mcp-tools-result" class="result">—</pre>
      </section>
      <section>
        <h3>4. tools/call</h3>
        <p class="muted">Llama una tool con argumentos JSON.</p>
        <label>Tool name <input id="mcp-tool-name" value="list_tickets"></label>
        <label>Arguments (JSON) <textarea id="mcp-tool-args" rows="3">{}</textarea></label>
        <button class="btn primary" onclick="mcpToolsCall()">▶ call</button>
        <pre id="mcp-call-result" class="result">—</pre>
      </section>
      <section>
        <h3>5. resources/list</h3>
        <button class="btn" onclick="mcpResourcesList()">📋 listar resources</button>
        <pre id="mcp-resources-result" class="result">—</pre>
      </section>
      <section>
        <h3>6. prompts/list + get</h3>
        <button class="btn" onclick="mcpPromptsList()">📋 listar prompts</button>
        <pre id="mcp-prompts-result" class="result">—</pre>
      </section>
    </div>
    <h3 style="margin-top:20px">Client config (Claude Desktop / Cursor / Cline)</h3>
    <pre class="result">{
  "mcpServers": {
    "azurdesk": {
      "url": "http://localhost:5200/mcp",
      "headers": { "Authorization": "Bearer &lt;your-jwt-token&gt;" }
    }
  }
}</pre>
  `;
  loadMCPInfo();
}

async function loadMCPInfo() {
  const r = await api('GET', '/mcp/info');
  document.getElementById('mcp-server-info').innerHTML = `
    <table class="data">
      <tr><th>Protocol</th><td>${r.protocolVersion}</td></tr>
      <tr><th>Server</th><td>${r.serverInfo.name} v${r.serverInfo.version}</td></tr>
      <tr><th>Transport</th><td>${r.transport}</td></tr>
      <tr><th>Endpoint</th><td><code>${r.endpoint}</code></td></tr>
      <tr><th>Methods</th><td>${r.methods.join(', ')}</td></tr>
      <tr><th>Capabilities</th><td>${Object.keys(r.capabilities).join(', ')}</td></tr>
    </table>`;
}

async function mcpRpc(method, params, id) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const r = await fetch('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: id || Date.now(), method, params: params || {} })
  });
  const sid = r.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  return await r.json();
}

async function mcpInitialize() {
  const r = await mcpRpc('initialize', { clientInfo: { name: 'azurdesk-ui', version: '1.0' } }, 1);
  if (r.result && r.result.sessionId) sessionId = r.result.sessionId;
  document.getElementById('mcp-init-result').textContent = JSON.stringify(r, null, 2);
}

async function mcpToolsList() {
  const r = await mcpRpc('tools/list', {}, 2);
  document.getElementById('mcp-tools-result').textContent = JSON.stringify(r, null, 2);
}

async function mcpToolsCall() {
  const name = document.getElementById('mcp-tool-name').value;
  let args = {};
  try { args = JSON.parse(document.getElementById('mcp-tool-args').value || '{}'); } catch {}
  const r = await mcpRpc('tools/call', { name, arguments: args }, 3);
  document.getElementById('mcp-call-result').textContent = JSON.stringify(r, null, 2);
}

async function mcpResourcesList() {
  const r = await mcpRpc('resources/list', {}, 4);
  document.getElementById('mcp-resources-result').textContent = JSON.stringify(r, null, 2);
}

async function mcpPromptsList() {
  const r = await mcpRpc('prompts/list', {}, 5);
  document.getElementById('mcp-prompts-result').textContent = JSON.stringify(r, null, 2);
}

// ===== Embeddings & HNSW (v2.6.12) =====
async function renderEmbeddings(el) {
  if (!el) return;
  el.innerHTML = `
    <h2>🔢 Embeddings &amp; HNSW</h2>
    <p class="muted">Vector store local con 256-dim BMF embeddings y búsqueda HNSW (Hierarchical Navigable Small World) aproximada + híbrida semántica/keyword. Almacenamiento en SQLite. Reemplazable por modelo externo (text-embedding-3-small, bge-small, nomic-embed-text) sin cambiar la API.</p>
    <div class="grid two">
      <section>
        <h3>1. Ingestar texto</h3>
        <label>Source <input id="emb-source" value="kb"></label>
        <label>Source ID <input id="emb-source-id" value="doc-1"></label>
        <label>Text <textarea id="emb-text" rows="3">SLA del ticket es 4 horas</textarea></label>
        <button class="btn primary" onclick="embIngest()">＋ Ingestar</button>
        <pre id="emb-ingest-result" class="result">—</pre>
      </section>
      <section>
        <h3>2. Search (exact kNN)</h3>
        <label>Query <input id="emb-query" value="¿cuál es el SLA?"></label>
        <label>k <input id="emb-k" type="number" value="5"></label>
        <button class="btn primary" onclick="embSearch()">🔍 search</button>
        <pre id="emb-search-result" class="result">—</pre>
      </section>
      <section>
        <h3>3. HNSW (approximate)</h3>
        <label>Query <input id="emb-hnsw-query" value="ticket database error"></label>
        <label>k <input id="emb-hnsw-k" type="number" value="5"></label>
        <label>ef <input id="emb-hnsw-ef" type="number" value="50"></label>
        <button class="btn primary" onclick="embHnsw()">🧭 hnsw</button>
        <pre id="emb-hnsw-result" class="result">—</pre>
      </section>
      <section>
        <h3>4. Hybrid (semantic + keyword)</h3>
        <label>Query <input id="emb-hybrid-query" value="password reset"></label>
        <label>α (semantic weight) <input id="emb-hybrid-alpha" type="number" step="0.05" value="0.7"></label>
        <button class="btn primary" onclick="embHybrid()">🔀 hybrid</button>
        <pre id="emb-hybrid-result" class="result">—</pre>
      </section>
      <section>
        <h3>5. Stats</h3>
        <button class="btn" onclick="embStats()">📊 stats</button>
        <pre id="emb-stats-result" class="result">—</pre>
      </section>
    </div>
  `;
  embStats();
}

async function embIngest() {
  const source = document.getElementById('emb-source').value;
  const sourceId = document.getElementById('emb-source-id').value;
  const text = document.getElementById('emb-text').value;
  const r = await api('POST', '/api/embeddings', { source, source_id: sourceId, text });
  document.getElementById('emb-ingest-result').textContent = JSON.stringify(r, null, 2);
}

async function embSearch() {
  const query = document.getElementById('emb-query').value;
  const k = Number(document.getElementById('emb-k').value) || 5;
  const r = await api('POST', '/api/embeddings/search', { query, k });
  document.getElementById('emb-search-result').textContent = JSON.stringify(r, null, 2);
}

async function embHnsw() {
  const query = document.getElementById('emb-hnsw-query').value;
  const k = Number(document.getElementById('emb-hnsw-k').value) || 5;
  const ef = Number(document.getElementById('emb-hnsw-ef').value) || 50;
  const r = await api('POST', '/api/embeddings/hnsw', { query, k, ef });
  document.getElementById('emb-hnsw-result').textContent = JSON.stringify(r, null, 2);
}

async function embHybrid() {
  const query = document.getElementById('emb-hybrid-query').value;
  const alpha = Number(document.getElementById('emb-hybrid-alpha').value) || 0.7;
  const r = await api('POST', '/api/embeddings/hybrid', { query, alpha });
  document.getElementById('emb-hybrid-result').textContent = JSON.stringify(r, null, 2);
}

async function embStats() {
  const r = await api('GET', '/api/embeddings/stats');
  document.getElementById('emb-stats-result').textContent = JSON.stringify(r, null, 2);
}


