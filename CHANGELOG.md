## [2.6.8] - 2026-06-29 — A-G Wire-up: Conductor-lite, LLM Router, MCP Gateway, Failure Prediction, ABAC/ReBAC, Portable

### Added
- **Conductor-lite** (ADR-033): motor de workflows determinísticos con DAG, replay idempotente y compensaciones. Tablas `conductor_workflows` y `conductor_runs`. Endpoints `/api/conductor/workflows` y `/api/conductor/runs`. UI integrada en `durable-workflows`. Tests `tests/conductor-lite.mjs` y `tests/conductor-lite-rest.mjs`.
- **LLM Multi-Provider Router** (ADR-034): endpoint `/api/llm/generate` con estrategias `balanced|cheap|fast|quality`, `preferred`, `maxCostPer1M` y fallback automático. UI `renderAAASRouter` conectada al endpoint correcto.
- **MCP Gateway** (ADR-035): registro de tools con `rate_limit_rpm` y `cost_per_call`, billing por llamada, toggle/delete/call y totales por tool. UI `renderMCPGateway` mejorada.
- **Failure Prediction + Self-Healing** (ADR-036): scoring de riesgo sobre señales y loop de auto-remediación con `applyHealing`. Nuevos endpoints `/api/self-healing/heal`, `/api/self-healing/actions/:id`, `/api/self-healing/actions`. UI unificada.
- **ABAC/ReBAC Unified AuthZ** (ADR-037): vista combinada con builder de políticas ABAC y operaciones ReBAC en un solo panel.
- **Portable Distribution** (ADR-038): `.env.example`, `README.PORTABLE.md`, `launch-azurdesk.bat/sh`, `verify-portable.bat/sh`. `.gitignore` excluye `.env`, `.env.local`, `*.zip`, `*.tar.gz`.

### Changed
- `src/services/conductorLiteService.js`: API `startRun` y `resumeRun` normalizadas para aceptar `(tenant_id, workflow_id, context, durableExec)` y `(tenant_id, run_id, {durableExec, stepHandlers})`.
- `src/services/selfHealingService.js`: añadido `applyHealing(tenant_id, actionId)` con mapa de remediations determinísticos.
- `public/static/app.js`: renderers actualizados para Conductor-lite, LLM router, MCP Gateway, Failure Prediction + Self-Healing, y ABAC/ReBAC unificado.
- `package.json`: `test` incluye `tests/conductor-lite.mjs` y `tests/conductor-lite-rest.mjs`; `checks` incluye `node scripts/audit-ui-backend.mjs`.

### Fixed
- Ruta dinámica A2A `PATCH /api/a2a/cards/:id` ya usa `pathname.startsWith('/api/a2a/cards/')` + `split('/').pop()`.
- View `agentic-rag` del HTML ya tiene renderer congruente.

### Verification
- `npm run checks`: ✅
- `npm run smoke`: 150/150
- `node tests/real-cases.mjs`: 54/54
- `npm test`: 222/222 pass, 1 skip (Obsidian real)
- UI/backend audit: 228 exact routes, 87 dynamic, 129 frontend API calls, 55 HTML views, 55 renderers — PASSED
- Portable `AzurDeskAI_v2.6.8.zip`: 57 MB

## [2.6.8] - 2026-06-29 — Simplicio Loop: UI congruencia + fixes de rutas dinámicas

### Fixed
- Ruta dinámica A2A `PATCH /api/a2a/cards/:id` usaba comparación literal contra el placeholder `:id`. Cambiado a `pathname.startsWith('/api/a2a/cards/')` con extracción del ID vía `split('/').pop()`.
- View `agentic-rag` del HTML no tenía renderer en `public/static/app.js`; agregado `renderAgenticRAG` y `runAgenticRAG` llamando `POST /api/rag/agentic`.

### Audit
- 55 views del HTML mapeados a funciones en `RENDERERS`.
- 119 llamadas `api(METHOD, '/api/...')` del frontend verificadas contra endpoints backend (224+ rutas, 83 dinámicas con `startsWith`).
- 0 rutas con placeholder literal `:id`.

### Verification
- `npm run checks`: ✅
- `npm run smoke`: 150/150
- `node tests/real-cases.mjs`: 54/54
- `npm test`: 216/216 pass, 1 skip (Obsidian real)

## [2.6.8] - 2026-06-29 — Agent Tracing OTel real con costos por model/provider

### Agent Tracing Service
- Servicio `agentTracingService.js`: implementación de trazabilidad tipo OpenTelemetry para agentes IA.
- Tablas `agent_traces`, `agent_traces_aggregates`, `agent_traces_model_costs`.
- Tracking de spans con atributos, latencia, costo calculado por modelo y proveedor.
- Integración con modelo de costos predeterminados (OpenAI, Anthropic, Google, Ollama, Local).
- Endpoints:
  - `POST /api/traces/start`
  - `POST /api/traces/end`
  - `GET /api/traces`
  - `POST /api/traces/model-cost`

### UI Agent Tracing
- Nueva pestaña "Agent Tracing" bajo "Plataforma".
- Renderer `renderAgentTracing` con formularios para iniciar/finalizar spans, consultar traces y actualizar costos de modelos.

### Verification
- Build: 212 tests / 211 pass / 0 fail / 1 skip (Obsidian real preexistente).
- Smoke: 150/150 endpoints.
- Real cases: 54/54.
- UI/backend congruencia: 55/55 (incluyendo nuevos endpoints de tracing).
