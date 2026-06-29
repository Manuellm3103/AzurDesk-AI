# Plan v2.6.3 — Cierre de Robustez e Innovación 2026

> **For Hermes:** Ejecutar inmediatamente sin preguntar. Evidence gate obligatorio.

**Goal:** Llevar AzurDesk AI de v2.6.2 a v2.6.3 con 5 innovaciones tecnológicas de 2026, deep research documentado y 100% tests verdes.

**Estado base:** v2.6.2 con build 179/178/0/1, smoke 121/121, real cases 39/39, portable .exe generado.

---

### Task 1: Documentar deep research 2026
**Files:** `docs/research/deep-research-2026-innovations.md`
**Action:** Compilar hallazgos de GitHub API (OpenAI Agents SDK, MetaGPT, CAMEL, Microsoft Agent Framework, RagaAI Catalyst, Spring AI Alibaba) y patrones de AaaS multi-tenant.
**Verify:** Archivo guardado con al menos 5 tecnologías listadas.

### Task 2: Implementar feature 1 — Agent Policy Engine nativo (reglas de negocio A2A/MCP)
**Files:** `src/services/policyEngineService.js`, `server.mjs`, `tests/policy-engine.mjs`
**Action:** Servicio para definir políticas YAML-like que aprueben/rechacen acciones de agentes (tool calls, tareas A2A, llamadas MCP) según condiciones.
**Verify:** Test pasa; endpoint expuesto; smoke incluye endpoint.

### Task 3: Implementar feature 2 — Agent Sandbox de ejecución segura
**Files:** `src/services/sandboxService.js`, `server.mjs`, `tests/sandbox.mjs`
**Action:** Sandbox deterministico para ejecutar funciones MCP/A2A con timeouts, allow-list de tools y cuotas CPU/memoria.
**Verify:** Test sandbox bloquea tool no permitido.

### Task 4: Implementar feature 3 — Agentic Alerting con causalidad
**Files:** `src/services/causalAlertService.js`, `server.mjs`, `tests/causal-alerts.mjs`
**Action:** Correlate fallos (smoke, self-healing, errors) y alerta con causa probable vía reglas y similitud de patrones.
**Verify:** Test genera alerta causal.

### Task 5: Implementar feature 4 — Self-Healing Auto-Remediation DSL
**Files:** `src/services/remediationDSLService.js`, `server.mjs`, `tests/remediation-dsl.mjs`
**Action:** DSL JSON para definir acciones de auto-remediación condicionales (restart service, notify, escalate, quarantine).
**Verify:** Test ejecuta remediación y verifica resultado.

### Task 6: Implementar feature 5 — Multi-tenant cost attribution por agente
**Files:** `src/services/agentCostService.js`, `server.mjs`, `tests/agent-cost.mjs`
**Action:** Tracking de costos LLM/tokens/tiempo por tenant, agente y sesión, con endpoints de reporte.
**Verify:** Test asigna costo correctamente.

### Task 7: UI enterprise para 5 innovaciones
**Files:** `public/index.html`, `public/static/app.js`
**Action:** Añadir tabs/renderers para Policy Engine, Sandbox, Causal Alerts, Remediation DSL, Agent Cost.
**Verify:** Congruencia UI/backend: cada tab mapea a renderer existente y endpoints responden.

### Task 8: Evidence gate final
**Action:** `npm run build` → server → smoke → real-cases → `npm run package:exe`.
**Verify:** 179/178/0/1, 121/121, 39/39, .exe generado.

### Task 9: CHANGELOG + ADR + version bump
**Files:** `CHANGELOG.md`, `docs/ADR-027-v2.6.3.md`, `package.json`, `server.mjs`
**Action:** Documentar decisiones, métricas e innovaciones.
**Verify:** Versión consistente en todos los archivos.
