# ADR-026: Ciclo 2 Cierre — UI Enterprise + BullMQ/Redis + Local LLM Router

## Estado
Accepted — 2026-06-27

## Contexto
Ciclo 2 original propuso 5 innovaciones: A2A protocol, MCP expandido, event-driven workers, local LLM router, OTel self-healing. Al auditar el sistema se encontró que el backend de las 5 innovaciones ya existía, pero faltaba UI enterprise para operarlas visualmente y un backend de colas real (BullMQ/Redis) para producción.

## Decisiones

1. **UI enterprise para Ciclo 2:** Se añadieron tabs `🛠️ MCP Tools` y `🧠 Local LLM` con renderers en `public/static/app.js`. Los tabs existentes (`A2A Standard`, `Agent DAG`, `Browser Agent`, `MCP Registry`, `Billing`, `OTel + Self-Heal`, `Event Queue`) ya cubrían el resto.

2. **BullMQ/Redis como backend opcional de event queue:** Se creó `bullmqQueueService.js` y se refactorizó `eventQueueService.js` para delegar a BullMQ cuando `REDIS_URL` esté configurado, con fallback automático a SQLite.

3. **Local LLM router expuesto en UI:** Los endpoints `/api/local-llm/models`, `/api/local-llm/route`, `/api/local-llm/generate` ya existían; se añadió renderer para registrar modelos y probar routing.

4. **Sin integración de inferencia real:** `localLLMRouterService.generate()` permanece como placeholder seguro. Integrar llama.cpp/ONNX requiere descargar binarios/modelos pesados y queda fuera del alcance de este cierre; se documenta explícitamente.

## Consecuencias
- Operadores pueden ejecutar MCP tools, registrar modelos locales y monitorear colas desde la UI.
- El sistema puede escalar workers con Redis sin cambiar la API de `eventQueueService`.
- El portable sigue funcionando sin Redis (fallback SQLite).

## Evidence Gate
- Build: 179 tests / 178 pass / 0 fail / 1 skip
- Smoke: 121/121 endpoints
- Casos reales: 39/39
- Portable v2.6.2 generado
