# ADR-020: MCP Server, Onboarding Wizard y Notificaciones en Vivo

## Estado

Aceptado

## Contexto

AzurDesk AI v2.0.0 es una plataforma AAAS funcional. Para cerrar la experiencia comercial y de integración, agregamos:
- **MCP Server**: que agentes externos (Claude, Cursor, Hermes) puedan descubrir y ejecutar herramientas de AzurDesk.
- **Onboarding Wizard**: flujo guiado para nuevos tenants sin fricción.
- **Notificaciones en vivo**: badge de notificaciones via WebSocket.

## Decisiones

1. **MCP sobre REST tradicional**: MCP (Model Context Protocol) es el estándar emergente de integración agente-servicio. Implementamos `tools/list`, `tools/call` e `initialize` con JSON-RPC 2.0.
2. **Reutilizar WebSocket de telemetry**: en lugar de abrir un segundo socket, extendimos `/ws/telemetry` para transportar mensajes `notifications`. Reduce conexiones y simplifica auth.
3. **Onboarding multi-step**: 4 pasos — plan, proveedor, workflow, test en vivo. Al finalizar se persisten todas las configuraciones.

## Consecuencias

- AzurDesk AI es ahora consumible por otros agentes de IA.
- Nuevos tenants pueden estar operativos en menos de 2 minutos.
- El badge de notificaciones se actualiza automáticamente cada 5s.

## Notas

- v2.1.0
- 116 tests, 115 pass, 1 skip, 0 fail
- 68/68 smoke checks
