# ADR-035 — MCP Gateway Multi-Tenant: Registry, Billing y Health

## Estado
Aceptado — 2026-06-29

## Contexto
AzurDesk AI expone tools MCP a agentes y a usuarios. Necesitamos un gateway multi-tenant que registre tools por servidor, aplique rate limiting, cobre por uso y permita habilitar/deshabilitar tools desde la UI.

## Decisión
Usar `src/services/mcpGatewayService.js` como gateway central:

- Tabla `mcp_gateway_tools` por `(tenant_id, server_id, tool_name)`.
- Registro con `rate_limit_rpm` y `cost_per_call`.
- Billing automático por llamada usando el cost service del tenant.
- Endpoints CRUD bajo `/api/mcp/gateway/tools` y `/api/mcp/gateway/call`.
- UI con tabla de tools, cost/call, toggle, delete, call y totales.

## Consecuencias

### Positivas
- Marketplace de tools medible y facturable.
- Control por tenant sin compartir estado.
- Rate limiting previene abuso.

### Negativas
- El gateway no implementa aún health-check periódico de servidores MCP (podría agregarse con un cron/heartbeat).
- `cost_per_call` es estático; no refleja tokens reales.

## Implementación
- `src/services/mcpGatewayService.js`
- Endpoints en `server.mjs`
- UI `renderMCPGateway` en `public/static/app.js`
- Tests `tests/mcp-gateway.mjs`

## Verificación
- `npm run smoke` incluye 5 endpoints MCP Gateway ✅
- `npm test` incluye `tests/mcp-gateway.mjs` ✅
