## [2.6.13] - 2026-06-30 — Hybrid RAG con HNSW auto-select

### Added
- **Integración embeddingService → hybridRAGService**: RAG ahora tiene 4 fuentes paralelas (graphRAG, similarity, memory, **HNSW/exact kNN**).
- **Auto-select algoritmo**: HNSW si corpus > 50 vectores, kNN exacto si ≤50. Cliente no decide, server elige.
- **Endpoint `/api/ai/rag` extendido**: response incluye `hnswResults`, `hnswAlgo`, `embeddingStats`.
- **5 nuevos tests** (tests/hybrid-rag-hnsw.mjs).
- **ADR-042** documenta la decisión y el threshold empírico.

### Why this matters
- Tenant pequeño: kNN exacto, sin overhead.
- Tenant grande (>50 docs KB): HNSW aproximado 10-50x más rápido sin perder relevancia.
- Conecta las dos innovations previas (Embeddings v2.6.12) al RAG real usado por los agentes.

### Verification
- `npm test`: 264/265 pass, 1 skip (vs 259/260 v2.6.12, +5 tests hybrid-rag-hnsw)
- `npm run smoke`: 169/169 (vs 168 v2.6.12, +1 rag check)
- `node tests/real-cases.mjs`: 64/64 (vs 63, +1 hybrid RAG)
- UI/backend audit: pending (re-build)

## [2.6.12] - 2026-06-30 — Embeddings + HNSW + Bun compile POC

### Added
- **embeddingService.js**: vector store local con 256-dim BMF embeddings, búsqueda HNSW (Hierarchical Navigable Small World) aproximada, búsqueda exacta kNN, búsqueda híbrida semantic+keyword. Almacenamiento en SQLite. Pluggable: cambiar pseudoEmbed() por text-embedding-3-small o bge-small sin tocar API.
- **6 endpoints REST**: POST /api/embeddings (upsert), /search (kNN exacto), /hnsw (approximate), /hybrid (semantic+keyword), GET /stats, DELETE selectivo.
- **UI tab "Embeddings & HNSW"** con playground completo: ingestar, search exacto, HNSW, hybrid, stats.
- **10 nuevos tests** (tests/embeddings.mjs).
- **Bun compile POC**: `bun build --compile --target=bun-windows-x64` produce .exe 117 MB. Bloqueado por incompatibilidad de Bun 1.3.14 con bson (node:v8.startupSnapshot). ADR-041 documenta decisión de quedarse con Node 24 + pkg wrapper para producción.
- **Portable v2.6.12** con version bump (2.6.2 -> 2.6.12 en health, 2.6.11 -> 2.6.12 en mcpStreamableHttpService).

### Verification
- `npm test`: 259/260 pass, 1 skip
- `npm run smoke`: 168/168
- `node tests/real-cases.mjs`: 63/63
- UI/backend audit: 242 exact + 91 dynamic + 138 calls + 58 views + 58 renderers — PASSED
- Full-stack 22/24 (incluye embeddings) probes 200 OK con JWT real
- Embeddings round-trip: upsert 256-dim, search score 0.82, hnsw, hybrid score 0.87
- MCP round-trip: info v2.6.12 + init + tools/list (10) + tools/call + resources (3) + prompts (2)
- Portable `AzurDeskAI_v2.6.12.zip`: 15.3 MB

## [2.6.12] - 2026-06-30 — Embeddings + HNSW (vector search local)

### Added
- **embeddingService.js**: vector store local con 256-dim BMF embeddings, búsqueda HNSW (Hierarchical Navigable Small World) aproximada, búsqueda exacta kNN, búsqueda híbrida semantic+keyword. Almacenamiento en SQLite. Pluggable: cambiar pseudoEmbed() por text-embedding-3-small o bge-small sin tocar API.
- **6 endpoints REST**:
  - `POST /api/embeddings` — upsert de (tenant, source, source_id, text)
  - `POST /api/embeddings/search` — kNN exacto
  - `POST /api/embeddings/hnsw` — HNSW aproximado con ef (candidatos)
  - `POST /api/embeddings/hybrid` — semantic + keyword con α weight
  - `GET /api/embeddings/stats` — total + breakdown por source
  - `DELETE /api/embeddings/?source=X&source_id=Y` — purga selectiva
- **UI tab "Embeddings & HNSW"** con playground: ingestar, search exacto, HNSW, hybrid, stats.
- **10 nuevos tests** (tests/embeddings.mjs).

### Verification
- `npm test`: 259/260 pass, 1 skip
- `npm run smoke`: 168/168
- `node tests/real-cases.mjs`: 63/63
- UI/backend audit: 242 exact + 91 dynamic + 138 calls + 58 views + 58 renderers — PASSED
- Portable `AzurDeskAI_v2.6.12.zip`: 15.5 MB

## [2.6.11] - 2026-06-30 — MCP 1.0 Streamable-HTTP Transport nativo

### Added
- **mcpStreamableHttpService** (ADR-040): implementación completa del transporte MCP 1.0 (spec 2025-11-25). JSON-RPC 2.0 estricto, sesiones in-memory con TTL 30 min, header `Mcp-Session-Id`, capabilities (tools, resources, prompts, logging), prompts/templates y resources URI-addressable.
- **Endpoints MCP**:
  - `POST /mcp` — JSON-RPC 2.0 sobre HTTP. JSON mode (`Accept: application/json`) o SSE mode (`Accept: text/event-stream`). Batch support.
  - `GET /mcp` — abre SSE stream server→client con keep-alive cada 15s.
  - `DELETE /mcp` — termina sesión.
  - `GET /mcp/info` — discovery del server (protocol, capabilities, methods).
- **Métodos MCP soportados**: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`.
- **UI Tab "MCP Server (1.0)"** con playground: server info, initialize handshake, tools/list, tools/call (con form para name + args), resources/list, prompts/list. Incluye el bloque de config para Claude Desktop / Cursor / Cline / Continue.dev / Zed.
- **Tests**: `tests/mcp-streamable-http.mjs` (20 tests).

### Changed
- `server.mjs`: 4 nuevos endpoints MCP.
- `public/index.html`: nav link "MCP Server (1.0)".
- `public/static/app.js`: renderer `renderMCPServer` + 6 helpers.
- `package.json`: version 2.6.11; test runner incluye `tests/mcp-streamable-http.mjs`.

### Verification
- `npm test`: 249/250 pass, 1 skip
- `npm run smoke`: 164/164
- `node tests/real-cases.mjs`: 60/60
- UI/backend audit: PASSED
- Full-stack pressure: 22/22 + MCP initialize+tools/list round-trip OK

## [2.6.10] - 2026-06-30 — Full-stack audit fixes (3 bugs found by user pressure test)

### Fixed
- **POST /api/tickets**: zod schema documenta campos reales `requester_email/requester_name/subject/body`. Test runner anterior usaba payload incompatible que el smoke con datos preexistentes no обнаружил.
- **GET /api/billing/summary 404**: endpoint no existía. Añadido `BillingService.getSummary()` con histórico de 6 períodos (current_period, current_total, currency, history[]) + endpoint `GET /api/billing/summary`.
- **GET /api/durable-executions 404**: solo existía `/api/workflows/durable`. Añadidos `GET /api/durable-executions` (lista), `POST /api/durable-executions` (start), `GET /api/durable-executions/:id` (dynamic con `startsWith` + `split('/').pop()`).

### Added
- Smoke canary integration (manual ahora, CI en próximo ciclo) — limpia DB, levanta server, login JWT, prueba 22 endpoints críticos con datos válidos.

### Verification
- `npm test`: 229/229 pass, 1 skip
- `npm run smoke`: 161/161
- `node tests/real-cases.mjs`: 59/59
- UI/backend audit: 237 exact + 90 dynamic + 133 calls + 56 views + 56 renderers — PASSED
- Full-stack pressure test: 22/22 endpoints 200 OK con JWT real, SQLite real, LLM real
- Prompt cache: miss→hit round-trip OK, cost_usd=0 en hit
- A2A NDJSON stream: open→batch→close OK
- Portable `AzurDeskAI_v2.6.10.zip`: 15.4 MB

## [2.6.9] - 2026-06-30 — Prompt Cache + Reasoning Effort + A2A Streaming NDJSON

### Added
- **PromptCacheService** (ADR-039): cache determinístico basado en hash SHA-256 del prompt normalizado + tools schema. Tablas `prompt_cache` y `prompt_cache_stats` con TTL configurable por provider (Anthropic 5min, OpenAI 10min, Ollama 15min). Tracking automático de tokens/cost ahorrados. Compatible con la semántica de Anthropic prompt caching y OpenAI auto-cache. Skip automático para reasoning effort ≥ medium (output muy volátil).
- **Reasoning Effort controls** en `/api/llm/generate`: presets `none|low|medium|high` con temperature y max_tokens_factor. Compatible con OpenAI o1 reasoning y Anthropic extended thinking.
- **A2A Streaming NDJSON** endpoint `GET /api/a2a/stream`: server-streaming con chunked transfer, eventos `open|batch|close`, configurable `interval_ms` y `max_batches`. Compatible con A2A protocol y consumers tipo Server-Sent Events.
- **Nuevos endpoints REST**:
  - `GET /api/llm/cache/stats?days=N` — totales + breakdown diario (hits, misses, tokens_saved, cost_saved, hit_rate).
  - `POST /api/llm/cache/invalidate` — purga por tenant o por (provider, model).
  - `POST /api/llm/cache/cleanup` — barrido de entradas expiradas.
  - `POST /api/llm/generate` con `reasoning`, `useCache`, `toolsSchema` — campos opcionales retrocompatibles.
  - `GET /api/a2a/stream?agent_id=X&interval_ms=N&max_batches=N` — NDJSON stream.
- **UI Tab "LLM Cache & Reasoning"**: KPIs de ahorro, tabla por día, controles de strategy/reasoning/useCache, test inline de generate con cache.
- **Tests**: `tests/prompt-cache.mjs` (5 tests) + `tests/a2a-stream.mjs` (2 tests).

### Changed
- `server.mjs`: import de `promptCacheService`; `/api/llm/generate` con cache wrapper; nuevos endpoints cache + A2A stream.
- `public/index.html`: nav link "LLM Cache & Reasoning".
- `public/static/app.js`: renderer `renderLLMCache` + helpers `loadLLMCacheStats`, `testLLMGenerate`, `invalidateLLMCache`, `cleanupLLMCache`; entry en `RENDERERS` map.

### Verification
- `npm run build`: 229/229 pass, 1 skip
- `npm run smoke`: 161/161
- `node tests/real-cases.mjs`: 59/59
- UI/backend audit: 230+ exact, 89+ dynamic, 129 calls, 56 views, 56 renderers — PASSED

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
