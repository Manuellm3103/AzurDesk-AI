# ADR-018: AAAS Self-Service Platform — Signup, Workflows, SSE, Rate Limiting

## Estado

Aceptado

## Contexto

AzurDesk AI se convierte en plataforma AAAS self-service. Los usuarios necesitan:
- Registrarse sin intervención admin (self-service)
- Construir pipelines de IA con flujos multi-step
- Recibir respuestas LLM en streaming (SSE)
- Tener rate limiting para proteger la plataforma

## Decisión

4 servicios nuevos:

1. **tenantService.js** — signup público crea tenant + admin user + quota automática. 4 planes: free/starter/pro/enterprise con quotas diferenciadas. Upgrade de plan actualiza quotas.
2. **workflowService.js** — AI Workflow Builder con nodos: prompt, condition, branch, output, delay, http, aggregate. Ejecución topológica (entry nodes → traversal). Variables `{{var}}` interpoladas entre nodos.
3. **SSE streaming** — endpoint `/api/aaas/stream` con Server-Sent Events para tokens en tiempo real. `onChunk` callback del AAAS router envía chunks vía `event: chunk`.
4. **rateLimitMiddleware.js** — rate limiting per-tenant (300 req/min default), paths exentos (health, plans, login, signup, docs), headers X-RateLimit-Limit/Remaining, error 429 con Retry-After.

## Consecuencias

- Plataforma self-service completa: registro → configurar → usar
- Workflows permiten pipelines de IA complejos sin código
- SSE da UX de tiempo real para LLM generation
- Rate limiting protege contra abuso
- 60 endpoints verificados en smoke (de 55 a 60)