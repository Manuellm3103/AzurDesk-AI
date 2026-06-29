# ADR-012: Live Agent Telemetry Dashboard

## Estado

Aceptado

## Contexto

AzurDesk AI ya tiene agentes, mesh, tickets y un Predictive Incident Radar. Operaciones necesita una vista en tiempo real de la salud de la fleet sin tener que refrescar páginas manualmente.

## Decisión

Agregar un WebSocket `/ws/telemetry` que emita snapshots cada 5 segundos con:

- Agentes activos: nombre, rol, estado, load_score, burnout_risk, open_tickets
- Nodos mesh activos: nombre, rol, availability, reputation
- Conteos de tickets: abiertos y críticos
- Resumen del radar: total, críticos, altos

El frontend tendrá una pestaña "📡 Live Agent Telemetry" que se conecta al WebSocket y renderiza métricas en vivo.

## Arquitectura

- `src/services/telemetryService.js` crea un `WebSocketServer` sobre el mismo servidor HTTP, en path `/ws/telemetry`.
- No requiere autenticación adicional en este MVP: usa `tenant_id` por query param.
- Snapshot se computa con `radarService.buildRadar` y consultas directas a SQLite.
- Intervalo de broadcast: 5000 ms.

## Formato del mensaje

```json
{
  "type": "snapshot",
  "data": {
    "ts": "2026-06-26T18:00:00.000Z",
    "tenant_id": "demo",
    "agents": [...],
    "mesh": [...],
    "tickets": { "open": 12, "critical": 3 },
    "radar": { "total": 15, "critical": 2, "high": 4 }
  }
}
```

## Consecuencias

- Nueva pestaña en dashboard.
- Nuevo test `tests/telemetry.mjs` que levanta servidor real y conecta WebSocket.
- No añade tablas ni endpoints REST adicionales.

## Riesgos y mitigaciones

- **Carga de base de datos**: consultas cada 5s para cada tenant con clientes conectados. Mitigación: snapshot es ligero (COUNT + SELECT limitado). En escala se puede cachear por tenant.
- **Clientes desconectados**: se eliminan de `clients` al recibir `close`/`error`.
- **Tenant boundary**: cada cliente especifica `tenant_id` y solo recibe datos de ese tenant.

## Fecha

2026-06-26
