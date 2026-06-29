# ADR-013: AI-as-a-Service (AAAS) Multi-Provider LLM Router

## Estado

Aceptado

## Contexto

AzurDesk AI empezó con un router básico que soportaba Ollama y OpenAI (hardcodeado). Con la evolución a plataforma enterprise, se requiere un sistema provider-agnostic donde cada tenant configure sus propias cuentas de LLM (Ollama local/cloud, Anthropic, Gemini, Groq, Cohere, OpenRouter y cualquier OpenAI-compatible) sin depender de un único proveedor.

## Decisión

Implementar un **AAAS Router** compuesto por:

1. **Provider Account Manager** (`providerAccountService.js`) con cifrado AES-256-GCM de API keys en SQLite.
2. **LLM Router** (`aaasRouterService.js`) que selecciona modelo por `complexity`, `strategy`, `preferred`, `multimodal` y `maxCostPer1M`.
3. **Fallback automático**: intenta hasta 3 candidatos, abre circuit breaker por 60s en fallo.
4. **Usage logging** (`llm_usage_logs`) para costos, latencia y tasa de éxito por proveedor.

## Consecuencias

- Cada tenant es dueño de sus credenciales.
- No hay lock-in a OpenAI.
- El router puede funcionar offline si el tenant configura Ollama local.
- Se asume formato OpenAI-compatible para la mayoría de proveedores; Gemini requiere base_url OpenAI-compatible.

## API

- `POST /api/aaas/providers`
- `GET /api/aaas/providers`
- `PUT|GET|DELETE /api/aaas/providers/:id`
- `GET /api/aaas/models`
- `POST /api/aaas/generate`
- `GET /api/aaas/usage`

## Seguridad

- API keys nunca se exponen en respuestas REST.
- Cifrado depende de `AAAS_MASTER_KEY` (env); fallback local con warning.
