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
