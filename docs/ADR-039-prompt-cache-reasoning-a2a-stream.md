# ADR-039: Prompt Cache + Reasoning Effort + A2A Streaming NDJSON

## Status
Aceptado — AzurDesk AI v2.6.9 (2026-06-30).

## Context
El LLM Multi-Provider Router ejecuta llamadas reales a OpenAI, Anthropic, Google y Ollama Cloud. Cada llamada incurre costo y latencia, incluso cuando el prompt se repite (catálogos, FAQs, tickets recurrentes). En 2026, los proveedores líderes (Anthropic con prompt caching, OpenAI con automatic caching, Google con context caching) ya ofrecen caching nativo server-side, pero con quirks por proveedor.

Adicionalmente, los modelos de razonamiento (OpenAI o1/o3, Anthropic extended thinking, Google thinking mode) requieren control explícito de "reasoning effort" para no quemar tokens en consultas simples.

Por último, el protocolo A2A (Agent-to-Agent) — formalizado en 2025 y adoptado por LangGraph, CrewAI y AG2 — requiere un canal streaming NDJSON para que los agentes consuman tarjetas a medida que se publican, sin polling agresivo.

## Decision
1. **Cache local determinístico** sobre el LLM router, con clave SHA-256 sobre prompt normalizado + tools schema. TTL por provider (Anthropic 5min, OpenAI 10min, Ollama 15min). Compatible con — pero no dependiente de — el caching server-side de cada provider.
2. **Skip automático del cache** cuando `reasoning_effort ∈ {medium, high}`: el output es demasiado volátil.
3. **Reasoning effort** presets `none|low|medium|high` con temperature y max_tokens_factor. Se acepta el campo en `/api/llm/generate` aunque el router interno aún no lo consuma (forward-compatible).
4. **A2A streaming NDJSON** sobre chunked transfer: `open` → `batch` (N) → `close`. `interval_ms` 500-10000ms, `max_batches` 1-60 (límite duro anti-DoS).
5. **Telemetría** de ahorro: `prompt_cache_stats` por día con hits, misses, tokens_saved, cost_saved. Endpoint `GET /api/llm/cache/stats` agrega totales.

## Consequences
- Reducción de costo LLM esperada: 30-90% según patrón de uso (clientes enterprise con tickets repetitivos).
- Latencia p50: cae dramáticamente en cache hit (de ~800ms a <5ms).
- Compatibilidad: 100% retrocompatible — campos nuevos son opcionales, defaults seguros.
- A2A streaming habilita integración con frameworks A2A-compliant (LangGraph 0.3+, CrewAI 0.80+, AG2 0.4+).
- Cache local se limpia vía `cleanup()`; admin puede invalidar tenant completo con `invalidate()`.

## Implementation
- `src/services/promptCacheService.js` (135 líneas): schema + CRUD + stats.
- `server.mjs`: import + `/api/llm/generate` reescrito con cache wrapper + 3 endpoints cache + 1 endpoint A2A stream (~85 líneas nuevas).
- `public/static/app.js`: `renderLLMCache` + 4 helpers (~88 líneas).
- `public/index.html`: 1 nav link.
- Tests: `tests/prompt-cache.mjs` (5) + `tests/a2a-stream.mjs` (2).

## Verification
- Unit: 7/7 pass
- Build: 229/229 pass, 1 skip
- Smoke: 161/161
- Real cases: 59/59
- UI/backend audit: PASSED
