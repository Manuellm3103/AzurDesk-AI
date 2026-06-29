# ADR-016: Platform Services — API Keys, Audit, Quota, OpenAPI

## Estado

Aceptado

## Contexto

AzurDesk AI necesita features enterprise para producción comercial:
- Acceso programático vía API keys (sin JWT expirable)
- Trazabilidad inmutable de acciones sensibles
- Control de costos y uso por tenant
- Autodocumentación API para integradores

## Decisión

4 servicios nuevos:

1. **apiKeyService.js** — keys SHA-256 hashed, prefijo `azdk_`, scopes, expiración, revocación. Middleware en `requireAuth` soporta X-API-Key header.
2. **auditService.js** — log inmutable de acciones (actor, action, resource, details, IP, UA). Filtros por action/resource/actor.
3. **quotaService.js** — quotas por tenant (calls/día, costo/día, API keys, agentes, storage). Reset diario automático. `checkLlmAllowed()` antes de generar.
4. **openApiService.js** — spec OpenAPI 3.1 generada dinámicamente con 31+ endpoints documentados.

## Consecuencias

- Tenants pueden integrar via API keys programáticas
- Toda acción sensible queda registrada con IP y user agent
- Costos LLM controlados por tenant, no hay spending ilimitado
- Integradores pueden consumir /api/docs para autodocumentación
- UI nueva pestaña ⚙️ Platform con todo integrado