# ADR-007: Agent Mesh Discovery para escalado inteligente de tickets

- **Status**: accepted
- **Date**: 2026-06-26

## Context

AzurDesk AI gestiona tickets críticos a través de agentes humanos y agentes LLM. Necesitábamos un mecanismo para descubrir, rankear y asignar automáticamente tickets críticos al "mejor agente experto" disponible, basándonos en skill match, salud y capacidad, en lugar de depender solo de una asignación estática o de reglas simples.

## Decision

Crear un marketplace interno de agentes expertos llamado **Agent Mesh Discovery**:

- Cada nodo representa un agente (humano o LLM) con skills, nivel, disponibilidad, reputación y endpoint.
- El servicio `agentMeshService` rankea candidatos usando una fórmula ponderada de skill overlap, nivel, disponibilidad y reputación.
- Se agregó sinónimos de skills (`red` ↔ `network`, `seguridad` ↔ `security`, etc.) para mejorar matching semántico.
- El hook `helpdeskService.createTicket` ahora consulta el mesh para tickets críticos/alta con nivel ≥2 sin asignar y auto-escala al mejor nodo.
- Exponemos REST endpoints y UI de dashboard para publicar, rankear y gestionar nodos.

## Consequences

- **Fácil**: escalado automático de tickets críticos; descubrimiento dinámico de expertos.
- **Fácil**: extensible a futuros agentes externos o LLM especializados.
- **Difícil**: requiere mantener skills actualizados y reputación/historial de calidad para evitar malas asignaciones.
- **Riesgo**: un nodo con `availability=1` pero saturado real puede recibir más carga; se mitiga con health score futuro.

## Alternatives

- **Reglas estáticas de asignación**: más simple pero frágil ante cambios de equipo.
- **Integración directa con calendario/agentes externos**: más potente pero requiere autenticación y polling.

## Related files

- `src/services/agentMeshService.js`
- `src/helpdesk/helpdeskService.js`
- `server.mjs` (endpoints `/api/mesh/*`)
- `public/static/app.js` (`renderMesh`)
- `tests/mesh.mjs`
