# ADR-040: MCP 1.0 Streamable-HTTP Transport nativo

## Status
Aceptado — AzurDesk AI v2.6.11 (2026-06-30).

## Context
MCP (Model Context Protocol) se convirtió en el estándar de facto para que agentes IA consuman herramientas externas. La versión 1.0 salió el 25 de noviembre de 2025 con un nuevo transporte "streamable-HTTP" que reemplaza al HTTP+SSE de la 0.x. Este transporte es lo que **Claude Desktop 1.0+, Cursor 0.45+, Cline 3.20+, Continue.dev 0.9+ y Zed** ya hablan nativamente.

AzurDesk ya tenía un endpoint MCP básico (mcpExpandedService) y un MCP Gateway con billing, pero ninguno implementaba el transporte streamable-HTTP oficial con `Mcp-Session-Id`, JSON-RPC 2.0 estricto ni el handshake `initialize`/`initialized`. Esto significaba que los clientes MCP-compliant no podían conectarse a AzurDesk como servidor.

## Decision
1. **Nuevo servicio `mcpStreamableHttpService.js`** que implementa el spec 2025-11-25:
   - JSON-RPC 2.0 estricto con códigos de error estándar (-32700, -32600, -32601, -32602, -32603).
   - Sesiones in-memory con TTL 30 min, garbage collection automático, header `Mcp-Session-Id`.
   - `tools/list`, `tools/call` (delega a mcpExpandedService), `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `ping`, `initialize`, `notifications/initialized`.
   - Capabilities: tools, resources, prompts, logging.
2. **Endpoint único `POST /mcp`** en `server.mjs`:
   - JSON mode (`Accept: application/json`) → respuesta JSON.
   - SSE mode (`Accept: text/event-stream`) → respuesta streamable.
   - Batch support (array de requests).
3. **`GET /mcp`** para abrir stream SSE server→client (keep-alive cada 15s, ready event).
4. **`DELETE /mcp`** para terminar sesión.
5. **`GET /mcp/info`** discovery público (dentro de auth — el cliente manda su JWT).
6. **UI tab "MCP Server (1.0)"** con playground completo: info, initialize, tools/list, tools/call, resources/list, prompts/list. Incluye el bloque de config para Claude Desktop/Cursor/Cline.

## Consequences
- AzurDesk AI ahora es un **MCP server 1.0 fully-compliant**. Cualquier cliente MCP 1.0+ puede consumirlo.
- Token JWT = mismo que para la API REST. Sin secrets adicionales.
- El cliente puede hacer `initialize` → `tools/list` → `tools/call` en JSON o SSE.
- Recursos AzurDesk (`azurdesk://tenant/helpdesk/metrics`, `azurdesk://tenant/agents`, `azurdesk://tenant/billing/summary`) son direccionables via URI.
- Sesiones efímeras (in-memory) — para HA/multi-instancia se debería mover a Redis (documentado como follow-up).

## Implementation
- `src/services/mcpStreamableHttpService.js` (270 líneas): JSON-RPC 2.0 dispatcher, sessions, capabilities, resources, prompts.
- `server.mjs`: import + 4 endpoints MCP (`POST /mcp`, `GET /mcp`, `DELETE /mcp`, `GET /mcp/info`) (~85 líneas nuevas).
- `public/static/app.js`: `renderMCPServer` + 6 helpers (~110 líneas).
- `public/index.html`: 1 nav link.
- Tests: `tests/mcp-streamable-http.mjs` (20 tests).
- Smoke: 3 nuevos checks (info, initialize, tools/list).
- Real cases: 1 nuevo (info).

## Verification
- Unit: 20/20 pass
- Build: 249/250 pass, 1 skip
- Smoke: 164/164
- Real cases: 60/60
- UI/backend audit: PASSED
- Full-stack pressure: 22/22 + MCP initialize+tools/list round-trip OK

## Commercial Value
- **Market expansion**: cualquier developer con Claude Desktop / Cursor puede conectar AzurDesk como tool provider.
- **Zero-friction onboarding**: el cliente pega el bloque de config y listo.
- **AaaS play**: se factura por invocación (MCP Gateway billing ya cubre esto).
- **Network effect**: aparece en listas de MCP servers públicos, atrayendo developers que ya usan estos clientes.
