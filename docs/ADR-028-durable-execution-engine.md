# ADR-028 — Durable Execution Engine con Event Sourcing en SQLite

## Estado
Aceptado — 2026-06-28

## Contexto
AzurDesk AI ejecuta workflows, agentes y pipelines de integración críticos para clientes enterprise. Necesitamos garantía de ejecución frente a reinicios, fallos transitorios y errores de red, sin añadir infraestructura externa (Temporal, etc.) que complique despliegues on-prem/single-tenant.

## Decisión
Implementar un Durable Execution Engine propio con event sourcing en SQLite:

- `durable_executions`: estado actual de cada ejecución (pending/running/failed/completed), contexto, resultado, intentos, límite de reintentos.
- `durable_execution_events`: log inmutable de eventos ordenados por `seq`.
- Workers / funciones de negocio son invocadas a través de `runActivity(seq, type, fn, payload)` que:
  1. Revisa si ya existe un evento completado con ese `seq` y `type`.
  2. Si existe, devuelve el resultado almacenado (replay idempotente).
  3. Si no, ejecuta `fn`, graba el evento y actualiza el estado.
- Al registrar un evento con error, si `attempts < max_attempts` el estado vuelve a `pending` para permitir reintento.

## Consecuencias

### Positivas
- Sin nuevas dependencias ni infraestructura.
- Tolerancia a fallos con reintentos y checkpoints.
- Auditoría completa de cada ejecución vía eventos.
- Idempotencia trivial para operaciones externas (cobros, aprovisionamiento).
- Portabilidad y single-tenant friendly.

### Negativas
- No escala horizontalmente por sí solo (necesitaría sharding o un broker central para múltiples workers).
- Concurrencia limitada por el locking de SQLite; aceptable para el volumen actual.
- No soporta timeouts ni cancelación explícita en esta primera versión.

## Alternativas consideradas
- **Temporal self-hosted**: muy potente pero añade operación compleja y requisitos de Docker/Postgres/Elasticsearch.
- **BullMQ + Redis**: ya usado para colas, pero no provee event sourcing ni replay automático de actividades.
- **Workflow existente `durableWorkflowService`**: más simple y orientado a steps secuenciales; se mantiene como caso particular; el nuevo engine lo generaliza.

## Implementación
- `src/services/durableExecutionService.js`
- Tablas en `src/services/db.js`
- Endpoints en `server.mjs` bajo `/api/executions`
- UI en `public/static/app.js` (`renderDurableExecutions`)
- Tests en `tests/durable-executions.mjs`

## Verificación
- `npm run build` pasa.
- Smoke incluye 5 endpoints de durable executions.
- Real cases incluyen creación y listado de pipelines.
