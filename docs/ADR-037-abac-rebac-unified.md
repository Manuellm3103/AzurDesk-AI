# ADR-037 — ABAC/ReBAC Unificado para Autorización Multi-Tenant

## Estado
Aceptado — 2026-06-29

## Contexto
AzurDesk AI tiene dos modelos de autorización: ABAC (`abacService.js`) para políticas basadas en atributos y ReBAC/Zanzibar-lite (`authorizationService.js`) para tuplas de relación. La UI los mostraba en vistas separadas y confundía a operadores.

## Decisión
Unificar la experiencia en una sola vista **ReBAC + ABAC — Unified AuthZ**:

- Panel izquierdo: operaciones ReBAC (write/delete tuple, check, expand, snapshot).
- Panel derecho: builder de políticas ABAC (resource, action, conditions, effect, priority).
- Panel inferior: evaluación unificada (ABAC evaluate + ReBAC check).
- Endpoints existentes `/api/authz/*` y `/api/abac/*` se mantienen.

## Consecuencias

### Positivas
- Menor carga cognitiva para admins de tenant.
- ReBAC para permisos granulares por objeto; ABAC para reglas transversales.
- Ambos modelos coexisten sin migración de datos.

### Negativas
- No hay unión semántica entre ABAC y ReBAC (no se evalúan juntos en un solo endpoint todavía).
- ReBAC soporta solo un nivel de userset en esta versión.

## Implementación
- `src/services/authorizationService.js` (ReBAC)
- `src/services/abacService.js` (ABAC)
- Endpoints en `server.mjs`
- UI `renderReBAC` en `public/static/app.js`
- Tests `tests/abac.mjs` y `tests/rebac.mjs`

## Verificación
- `npm test` ✅ (authorizationService + ABAC)
- `npm run smoke` ✅ (authz endpoints)
- `node tests/real-cases.mjs` ✅ (ABAC + ReBAC)
