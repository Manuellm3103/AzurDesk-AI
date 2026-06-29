# ADR-009: Legal Case Management integrado al helpdesk

- **Status**: accepted
- **Date**: 2026-06-26

## Context

AzurDesk AI empezó como helpdesk TI, pero el área legal de EAC necesita gestionar casos (contratos, litigios, compliance, IP) con flujo de aprobaciones, documentos y SLA propios. En lugar de una herramienta separada, decidimos extender AzurDesk con un módulo legal nativo.

## Decision

Crear **Legal Case Management** dentro de AzurDesk AI:

- Esquema dedicado: `legal_cases`, `legal_tasks`, `legal_documents`, `legal_approvals`, `legal_notes`.
- Servicio `legalCaseService` con:
  - Generación de número de caso `LEG-YYYY-NNNN`.
  - Risk score AI basado en texto + monto + tipo.
  - Prioridad inferida y SLA por prioridad.
  - Niveles de aprobación requeridos según tipo/monto.
  - Flujo de estados legales.
  - Tareas, notas y aprobaciones.
- Endpoints REST y UI de dashboard con listado, filtros y vista de detalle.

## Consequences

- **Fácil**: unifica helpdesk + legal en una plataforma; aprovecha auth, tenants y agents.
- **Fácil**: extensible a más prácticas legales (templates, document review, e-signature).
- **Difícil**: requiere permisos más granulares (abogado vs socio vs compliance).
- **Riesgo**: datos legales son sensibles; se debe auditar accesos y cifrar documentos en futuras versiones.

## Alternatives

- **Integración con CLM externo (Ironclad, ContractWorks)**: más robusto pero costoso y fuera del control de AzurDesk.
- **Tabla genérica de "proyectos"**: reutilizable pero perdería semántica legal y aprobaciones.

## Related files

- `src/services/legalCaseService.js`
- `src/services/db.js` (tablas legales)
- `server.mjs` (endpoints `/api/legal/*`)
- `public/static/app.js` (`renderLegal`)
- `tests/legal.mjs`
