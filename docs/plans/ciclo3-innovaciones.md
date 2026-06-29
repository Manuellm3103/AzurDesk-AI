# Ciclo 3 — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Añadir 5 innovaciones AaaS de 2026 a AzurDesk AI v2.4.0: A2A standard tasks, agent DAG orchestrator, browser agent, MCP registry client y usage-based billing.

**Architecture:** Cada innovación se implementa como servicio SQLite-first + endpoints REST + tests + UI tab, integrándose al Agent Runtime y Gateway existentes.

**Tech Stack:** Node.js 24+ ESM, better-sqlite3, vanilla JS frontend, Playwright/Puppeteer opcional.

---

### Task 1: A2A Standard Tasks Service

**Objective:** Migrar a2aService al modelo Task/Artifact/Message del protocolo A2A oficial.

**Files:**
- Create: `src/services/a2aStandardService.js`
- Modify: `src/services/db.js` (tabla `a2a_tasks`), `server.mjs`, `src/services/aaasGatewayService.js`, `tests/smoke.mjs`
- Test: `tests/a2a-standard.mjs`

**Step 1:** Schema migration en `src/services/db.js`:
```sql
CREATE TABLE IF NOT EXISTS a2a_tasks (
  id TEXT PRIMARY KEY, tenant_id TEXT, task_id TEXT, status TEXT DEFAULT 'submitted',
  sender TEXT, receiver TEXT, payload TEXT, artifacts TEXT, messages TEXT,
  created_at TEXT, updated_at TEXT
);
```

**Step 2:** Implementar `submitTask`, `getTask`, `updateTask`, `listTasks` con `Task` lifecycle (`submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`).

**Step 3:** Test TDD:
```js
import test from 'node:test';
import a2a from '../src/services/a2aStandardService.js';
test('submit and complete task', () => {
  const t = a2a.submitTask({ tenant_id:'t1', sender:'agent-a', receiver:'agent-b', payload:{intent:'ticket.create'} });
  assert.equal(t.status,'submitted');
  const completed = a2a.updateTask(t.id,'completed',{artifact:{ticket_id:'123'}});
  assert.equal(completed.status,'completed');
});
```

**Step 4:** Endpoints en `server.mjs`:
- `POST /api/a2a/tasks`
- `GET /api/a2a/tasks/:id`
- `POST /api/a2a/tasks/:id/update`

**Step 5:** Gateway intent `a2a.submit` → llama al servicio.

**Step 6:** Smoke tests y UI tab "A2A Standard".

**Verify:** `node --test tests/a2a-standard.mjs` → PASS; `npm run build` → all green.

---

### Task 2: Agent DAG Orchestrator

**Objective:** Planificar un intent como grafo acíclico de invocaciones entre agentes core.

**Files:**
- Create: `src/services/agentDAGService.js`
- Modify: `src/services/db.js`, `server.mjs`, `src/services/aaasGatewayService.js`
- Test: `tests/agent-dag.mjs`

**Step 1:** Modelo DAG:
```js
const plan = [
  { id:'1', agent:'Helpdesk Agent', intent:'ticket.create', deps:[] },
  { id:'2', agent:'Knowledge Agent', intent:'rag.search', deps:['1'] },
  { id:'3', agent:'ML Agent', intent:'ml.classify', deps:['1'] }
];
```

**Step 2:** Ejecutar topológicamente, guardando span/run por nodo.

**Step 3:** TDD con plan simple.

**Step 4:** Endpoint `POST /api/agents/dag` y gateway intent `dag.run`.

**Verify:** `node --test tests/agent-dag.mjs` → PASS.

---

### Task 3: Browser Agent

**Objective:** Agregar skill de navegación web autónoma a CUA Agent vía Playwright.

**Files:**
- Create: `src/services/browserAgentService.js`
- Modify: `src/services/aaasGatewayService.js`, `package.json` (opcional dep)
- Test: `tests/browser-agent.mjs`

**Step 1:** Instalar `playwright` opcional; si no está, devolver stub.

**Step 2:** Implementar `navigate(url)`, `extractText()`, `click(selector)`, `fill(selector, value)`.

**Step 3:** TDD con stub.

**Step 4:** Gateway intent `browser.navigate`, `browser.extract`.

**Verify:** test pasa sin Playwright instalado.

---

### Task 4: MCP Registry Client

**Objective:** Descubrir e importar MCP servers públicos.

**Files:**
- Create: `src/services/mcpRegistryService.js`
- Modify: `server.mjs`, `src/services/aaasGatewayService.js`
- Test: `tests/mcp-registry.mjs`

**Step 1:** Cache local de servers (`mcp_registry_servers`):
```sql
CREATE TABLE mcp_registry_servers (id TEXT PRIMARY KEY, name TEXT, url TEXT, capabilities TEXT, installed INTEGER);
```

**Step 2:** Funciones `search(query)`, `install(id)`, `listInstalled()`.

**Step 3:** TDD con mocks.

**Step 4:** Endpoints `GET/POST /api/mcp/registry/*`.

**Verify:** test + smoke.

---

### Task 5: Usage-Based Billing

**Objective:** Contar invocaciones de agente, tokens y storage por tenant.

**Files:**
- Create: `src/services/billingService.js`
- Modify: `src/services/db.js`, `server.mjs`, `src/services/aaasGatewayService.js` (hook post-invoke)
- Test: `tests/billing.mjs`

**Step 1:** Tablas:
```sql
CREATE TABLE billing_usage (id TEXT PRIMARY KEY, tenant_id TEXT, resource TEXT, metric TEXT, quantity REAL, period TEXT, created_at TEXT);
CREATE TABLE billing_plans (id TEXT PRIMARY KEY, tenant_id TEXT, plan TEXT, price REAL, currency TEXT, renews_at TEXT);
```

**Step 2:** Funciones `recordUsage`, `getUsage`, `getInvoice`.

**Step 3:** Hook en gateway: después de cada invoke, `recordUsage(tenant_id, intent)`.

**Step 4:** Endpoints `GET /api/billing/usage`, `GET /api/billing/invoice`.

**Verify:** test + smoke + build.

---

### Task 6: UI Tabs para Ciclo 3

**Objective:** Añadir pestañas y renderers para A2A Standard, Agent DAG, Browser Agent, MCP Registry y Billing.

**Files:**
- Modify: `public/index.html`, `public/static/app.js`

**Verify:** Todos los nav links tienen renderer; navegación no genera errores de consola.

---

### Task 7: Version bump y empaquetado

**Objective:** Pasar a v2.5.0, actualizar CHANGELOG, docs comerciales y `.exe`/`.bat`.

**Files:**
- Modify: `package.json`, `server.mjs`, `CHANGELOG.md`, `docs/commercial/README-v2.3.0.md`, `docs/ADR-023-ciclo3.md`

**Verify:** `npm run build`, `npm run smoke`, `npm run package:exe`, smoke del `.bat`.

---

## Evidence Gate Rule

Nunca declarar "listo" sin ejecutar en el mismo turno:
- `npm run build`
- servidor fresco en background
- `node tests/smoke.mjs`
- `npm run package:exe`
- smoke del `.bat`
- matar servidor y verificar puerto libre
