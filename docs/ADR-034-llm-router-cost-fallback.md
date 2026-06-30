# ADR-034 — LLM Multi-Provider Router con Cost Prediction y Fallback

## Estado
Aceptado — 2026-06-29

## Contexto
AzurDesk AI soporta múltiples proveedores LLM (Ollama, Ollama Cloud, Anthropic, Gemini, Groq, Cohere, OpenRouter, OpenAI-compatible). Los usuarios necesitan que la plataforma elija automáticamente el mejor modelo según estrategia de negocio y caiga gracefulmente a un proveedor local si los remotos fallan.

## Decisión
Refinar el endpoint `/api/llm/generate` en `server.mjs` para exponer el router existente de `src/services/llmRouter.js` con:

- Estrategias: `balanced`, `cheap`, `fast`, `quality`.
- `preferred` para forzar proveedor.
- `maxCostPer1M` para filtrar por presupuesto.
- `fallback=true` para intentar proveedores alternativos ante error.
- Respuesta incluye `provider`, `model`, `costEstimate`, `tokens`, `latencyMs` y `fallbackUsed`.

## Consecuencias

### Positivas
- Decisiones de routing transparentes y auditable.
- Reducción de costos con estrategia `cheap`.
- Mayor disponibilidad con fallback automático.
- UI existente conectada al endpoint correcto.

### Negativas
- `costEstimate` es heurístico hasta que los providers reportan usage real.
- Fallback puede aumentar latencia si el primero falla con timeout largo.

## Implementación
- `src/services/llmRouter.js` (ya existente, usado directamente).
- Endpoint `/api/llm/generate` en `server.mjs`.
- UI `renderAAASRouter` en `public/static/app.js`.

## Verificación
- `npm run smoke` incluye `/api/llm/stats` ✅
- `npm test` incluye `tests/aaas-router.mjs` ✅
