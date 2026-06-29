# ADR-029 — MCP Gateway Multi-Tenant con Rate-Limiting y Billing

## Estado
Aceptado — 2026-06-28

## Contexto
AzurDesk AI expone herramientas MCP (Model Context Protocol) para que agentes y usuarios interactúen con sistemas externos (GitHub, Slack, Notion, calendarios, etc.). Para vender esto a clientes enterprise SaaS necesitamos:
1. Registro multi-tenant de qué tools están habilitadas.
2. Rate-limiting por tenant/tool para proteger costos y capacidad.
3. Billing automático por llamada para facturación granular.

## Decisión
Implementar `MCPGatewayService` como capa de control sobre `MCPRegistryService`:

- `mcp_gateway_tools`: metadatos del tool por tenant (server_id, tool_name, enabled, rate_limit_rpm, cost_per_call).
- `mcp_gateway_calls`: log inmutable de cada invocación con input, output, cost, status, error.
- `call()` verifica rate-limit contando calls del último minuto; si se excede, devuelve error y registra el rechazo.
- Si `cost_per_call > 0`, se registra un cargo en `agent_cost_charges` vía `agentCostService`.
- Stub de ejecución: la primera versión simula la respuesta del tool real, dejando listo el punto de integración para conectar con stdio/SSE/HTTP MCP servers.

## Consecuencias

### Positivas
- Control multi-tenant sin dependencias nuevas.
- Billing listo para SaaS (por tool, por tenant, por llamada).
- Rate-limiting simple y efectivo (ventana de 1 minuto).
- Auditoría completa de invocaciones.
- Facilita monetización de integraciones premium.

### Negativas
- Ejecución real de tools MCP queda pendiente de conector stdio/SSE; ahora es un stub.
- Rate-limit basado en SQLite no escala horizontalmente (aceptable para el volumen actual).
- No hay retry ni durable execution en esta primera versión.

## Alternativas consideradas
- Exponer MCP servers directamente sin gateway: pierde control de billing y rate-limit.
- Usar API gateway externo (Kong, Envoy): añade infraestructura innecesaria.

## Implementación
- `src/services/mcpGatewayService.js`
- Tablas en `src/services/db.js`
- Endpoints en `server.mjs` bajo `/api/mcp/gateway`
- UI en `public/static/app.js` (`renderMCPGateway`)
- Tests en `tests/mcp-gateway.mjs`

## Verificación
- Build verde.
- Smoke incluye 5 endpoints de gateway.
- Real cases incluyen registro de tool y totales.
