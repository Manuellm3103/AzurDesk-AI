# Deep Research GitHub: Innovaciones AaaS / Autonomous Business / Zero Employees

Fecha: 2026-06-27
Fuentes: 36 repositorios GitHub analizados vía API.

## Hallazgos principales

### 1. Agent Harness / Agent OS (tendencia dominante)
- **LobeHub** (79k ⭐): Chief Agent Operator. Organiza agentes en operaciones 7×24. Contrata, agenda, reporta.
- **DeerFlow** (74k ⭐): SuperAgent harness con subagents, memoria, sandboxes, skills, message gateway.
- **CowAgent** (45k ⭐): Super AI assistant con planning, computer control, skills, knowledge base, auto-evolución.
- **OpenFang** (17k ⭐): Agent Operating System en Rust. "Hands" autónomos que trabajan sin que el usuario escriba.
- **HolaOS** (5.5k ⭐): Local-first super agent para trabajo. Electron. 100+ integraciones.

**Patrón común:**
- Agentes como unidad de trabajo.
- Skills extensibles.
- Memoria de largo plazo.
- Computer Use / desktop automation.
- Scheduling de tareas recurrentes.

### 2. Orchestración
- **Conductor** (Netflix/Orkes): Durable workflow engine para agentes. Java, pero concepto clave.
- **Agent Orchestrator** (Composio): Parallel coding agents en workspaces aislados, CI fixes, reviews.
- **OpenAI Agents SDK**: Handoffs, guardrails, sessions, tracing, realtime, sandbox agents.

**Patrón:**
- Durable execution con retries y state recovery.
- Parallel agents en worktrees aislados.
- Handoffs y guardrails.

### 3. Persistent Memory
- **agentmemory** (24k ⭐): Memoria persistente para agentes de coding. Basado en iii engine. Confidence scoring, lifecycle, knowledge graph, hybrid search. Soporta Claude Code, Codex, Cursor, Hermes, OpenClaw.

**Patrón:**
- 3-tier memory: context / daily / core.
- Hybrid keyword + vector retrieval.
- Knowledge graph visual.
- Self-evolution: revisa conversaciones, mejora skills, consolida memoria.

### 4. LLM Router / Cost Optimization
- **Manifest** (7k ⭐): Smart model router. Ahorra hasta 70% en costos. Routing por complejidad, headers, múltiples providers.
- **NadirClaw** (548 ⭐): Drop-in proxy. Clasifica simple vs complex. Ahorra 40-70%.
- **bitrouter**: Agentic LLM gateway & router con guardrails.
- **olla**: Proxy/load balancer para LLM infrastructure.

**Patrón:**
- Clasificador simple/complex (~10ms overhead).
- Fallback chains.
- Cost tracking por query.
- OpenAI-compatible proxy.

### 5. Agent Teams / Workforces
- **Agent Teams AI** (1.4k ⭐): Desktop app. Agentes se mensajean, revisan trabajo. Kanban board.
- **AgentsMesh** (2.2k ⭐): Workforce platform. Runner fleet, workspace isolation, scheduling.
- **Agent Orchestrator**: Parallel coding agents.

**Patrón:**
- Equipos de agentes con roles.
- Kanban board de tareas de agentes.
- Runner fleet para aislamiento.
- Revisión entre agentes.

### 6. MCP como estándar
- OpenFang, Strands Agents, LobeHub usan MCP.
- AzurDesk ya tiene MCP server nativo — ventaja competitiva.

## Recomendaciones de integración para AzurDesk AI v2.3.0+

| Tecnología/patrón | Cómo integrar | Archivos afectados |
|---|---|---|
| Agent Harness | Crear `agentHarnessService.js` con skills registrados, scheduling y ejecución | `src/services/agentHarnessService.js` |
| Persistent Memory (agentmemory-style) | Mejorar Engram: confidence, lifecycle, knowledge graph, hybrid search | `src/services/engramService.js`, `src/services/db.js` |
| LLM Cost Router | Clasificador simple/complex en `aaasRouterService.js` + cost tracking | `src/services/aaasRouterService.js` |
| Agent Teams Kanban | Mejorar Kanban para mostrar tareas de agentes y estado | `public/static/app.js`, `src/services/kanbanService.js` |
| Autonomous Hands | Tareas recurrentes autónomas tipo OpenFang | `src/services/autonomousHandsService.js` |
| Durable Orchestration | Retries y state recovery en `orchestratorService.js` | `src/services/orchestratorService.js` |
| .exe packaging | Build con pkg/nexe | `scripts/build-exe.mjs` |

## Proyectos más relevantes para robustecer TI support

1. **CowAgent** — skills + memory + computer control (muy alineado con AzurDesk).
2. **agentmemory** — memoria persistente para agentes de coding; adaptable a helpdesk.
3. **NadirClaw/Manifest** — reducir costos de LLM en operaciones TI.
4. **Agent Orchestrator** — parallel agents para resolver tickets complejos.
5. **Conductor** — durable workflows para escalaciones y runbooks.
6. **OpenFang** — concepto de "Hands" autónomos para monitoreo y reporting.

## Nota

No se pudo acceder a Reddit (web_search caído). El análisis se basa en GitHub API y READMEs de los repositorios proporcionados.
