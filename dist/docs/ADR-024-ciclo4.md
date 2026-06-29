# ADR-024: Ciclo 4 — Innovaciones AaaS Workforce, Agentic RAG, ABAC, Eval y Mesh Sync

## Status
Accepted

## Context
AzurDesk AI v2.5.0 ya tiene 177 tests, 176 pass y 119 endpoints smoke. El siguiente escalón comercial es convertir a los agentes de simples handlers de intenciones en una **fuerza laboral de agentes** (workforce): programación, autorización fina, evaluación continua y descubrimiento de nodos.

## Decisiones
1. **Agent Workforce Scheduler** — asignación por skills, carga y prioridad sobre `agents` existente.
2. **Agentic RAG Planner** — pipeline plan → retrieve → deduplicate → synthesize reutilizando `hybridRAGService`.
3. **ABAC Policies** — attribute-based access control con condiciones JSON y efecto allow/deny.
4. **Agent Eval Suite** — golden cases y evaluación vía `aaasGatewayService.invoke`.
5. **Agent Mesh Sync** — heartbeat de nodos con TTL pruning para red local de agentes.

## Consequences
- Nuevas tablas: `workforce_assignments`, `abac_policies`, `agent_eval_cases`, `agent_eval_runs`.
- 5 servicios SQLite-first, 5 tests, 10 endpoints adicionales.
- Smoke aumenta de 109 a 119 endpoints.
