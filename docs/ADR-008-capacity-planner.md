# ADR-008: Capacity Planner para predicción de carga de equipo

- **Status**: accepted
- **Date**: 2026-06-26

## Context

El equipo de soporte y agentes LLM operan con ventanas de SLA. Sin una proyección de capacidad, es fácil quedarse corto de agentes durante picos de tickets o mantener sobrecapacidad en horas bajas. Queríamos una señal temprana de cuántos agentes se necesitarán en las próximas horas.

## Decision

Implementar **Capacity Planner**:

- Servicio `capacityPlannerService` que analiza tickets creados en una ventana deslizante (`hours`).
- Proyecta tasa de llegada, workload total, capacidad disponible y utilización.
- Calcula `agents_needed` y `risk` (`low`/`medium`/`high`/`critical`).
- Endpoint `GET /api/capacity/forecast?hours=4` y UI con métricas en tiempo real.

## Consequences

- **Fácil**: tomar decisiones de staffing con datos; integrar alertas futuras.
- **Fácil**: sirve como input para Agent Mesh (escalar nodos) y Rebalance AI.
- **Difícil**: el forecast simple asume tasa constante; picos súbitos no se predicen.
- **Riesgo**: en tenants con poca data, la proyección puede ser inestable.

## Alternatives

- **Modelo ML de series temporales**: más preciso pero requiere entrenamiento y datos históricos.
- **Integración con calendario de agentes**: mejor para capacidad real, pero más compleja.

## Related files

- `src/services/capacityPlannerService.js`
- `server.mjs` (`/api/capacity/forecast`)
- `public/static/app.js` (`renderCapacity`)
- `tests/capacity.mjs`
