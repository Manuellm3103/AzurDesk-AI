# ADR-027: Innovaciones Agentic AI 2026 — v2.6.3

## Estado
Aceptado — 2026-06-28

## Contexto
Para mantener a AzurDesk AI en la frontera comercial 2026 se integraron cinco capacidades agentic: control de políticas, sandboxing, alertado causal, remediación declarativa y contabilidad de costos. Estas ya no son experimentales: forman parte del runtime AaaS y deben pasar los mismos gates de build/smoke/real-cases que el resto de la plataforma.

## Decisiones

### 1. Agent Policy Engine
- Reglas JSON con `effect: allow|deny`, condiciones (`eq`, `gt`, `gte`, `lt`, `lte`, `in`) y prioridad.
- Evaluación determinista: deny primero, luego allow, default allow.
- Persistencia en `agent_policies` y log de decisiones en `agent_policy_decisions`.

### 2. Agent Sandbox
- Cada `agent_id` ejecuta en una sandbox con lista blanca de herramientas y límites (`max_ms`).
- Estados: idle → running → stopped.
- Ejecuciones registradas en `agent_sandbox_executions`.

### 3. Causal Alerting
- Z-score móvil por métrica/source; ventana de correlación temporal de 10 minutos.
- Acumulación de severidad cuando múltiples fuentes reportan la misma métrica.

### 4. Remediation DSL
- Reglas `trigger + condition + actions`. Acciones: `notify`, `http`, `runbook`, `noop`.
- Runbooks con plantillas `${variable}` reemplazadas por contexto.

### 5. Agent Cost Attribution
- Cargos `tenant_id + agent_id + metric + quantity + timestamp`.
- Tasas fijas por categoría (`agent.invocation`, `llm.tokens`, `storage.gb`, `compute.ms`).
- Endpoint `POST /api/costs/estimate` para pre-calcular costos LLM.

## Consecuencias
- +5 servicios, +5 endpoints HTTP, +5 tests unitarios, +10 casos real-cases.
- Smoke crece de 121 a 128 endpoints.
- Real cases crece de 39 a 44.
- Portable v2.6.3 incluye todo lo anterior.

## Evidence
- Build: 184 tests / 183 pass / 0 fail / 1 skip.
- Smoke: 128/128.
- Real cases: 44/44.
- Portable: `dist/azurdesk-ai-pro-2.6.3.zip` (717 KB).
