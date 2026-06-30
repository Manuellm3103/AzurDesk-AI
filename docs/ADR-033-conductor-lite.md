# ADR-033 — Conductor-lite: Workflow Engine Determinístico sobre Durable Execution

## Estado
Aceptado — 2026-06-29

## Contexto
Tras ADR-028 (Durable Execution Engine) los clientes enterprise pidieron definir workflows multi-paso con dependencias, compensaciones y ejecución visual sin escribir código. Necesitamos una capa de orquestación nativa, determinística y auto-recuperable, que no dependa de orquestadores externos.

## Decisión
Implementar **Conductor-lite** como motor de workflows determinísticos sobre `durableExecutionService.js`:

- Tablas propias `conductor_workflows` y `conductor_runs`.
- DAG de steps con `seq`, `deps`, `type`, `handler` y `compensation`.
- Ejecución topológica con replay idempotente: cada step se ejecuta una sola vez por `(execution_id, seq)`.
- Compensaciones invocadas en orden inverso cuando un step falla y el workflow lo especifica.
- API REST bajo `/api/conductor/workflows` y `/api/conductor/runs`.
- UI integrada en `public/static/app.js` bajo la view `durable-workflows`.

## Consecuencias

### Positivas
- Workflows declarativos sin infraestructura externa.
- Checkpoint automático por step; soporta caída y reanudación.
- Compensaciones para rollback semántico.
- Fácil de extender con nuevos `type` de step.

### Negativas
- Sin UI drag-and-drop en esta versión (formulario JSON).
- Compensaciones deben ser idempotentes (responsabilidad del operador).
- SQLite locking limita concurrencia de runs simultáneos.

## Implementación
- `src/services/conductorLiteService.js`
- Endpoints en `server.mjs`
- Renderer `renderConductorWorkflows` en `public/static/app.js`
- Tests `tests/conductor-lite.mjs` y `tests/conductor-lite-rest.mjs`

## Verificación
- `node --test tests/conductor-lite.mjs` ✅
- `node --test tests/conductor-lite-rest.mjs` ✅
- Integrado en `npm test` (222 pass, 1 skip).
