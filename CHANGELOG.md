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
