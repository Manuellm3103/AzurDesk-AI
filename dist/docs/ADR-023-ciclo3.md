# ADR-023: Ciclo 3 — Innovaciones AaaS 2026

## Status
Accepted

## Context
AzurDesk AI v2.4.0 ya es una plataforma AaaS funcional con Agent Runtime y Gateway. Para mantener ventaja competitiva en 2026, se integran 5 innovaciones clave del ecosistema open-source.

## Decision

### 1. A2A Standard Tasks
Se reemplaza A2A legacy por el protocolo Task/Artifact/Message del proyecto `a2aproject/A2A`.
- Servicio: `src/services/a2aStandardService.js`
- Endpoint: `/api/a2a/tasks`
- Tabla: `a2a_tasks`

### 2. Agent DAG Orchestrator
Los intents complejos se descomponen en grafos acíclicos de agentes core y se ejecutan topológicamente.
- Servicio: `src/services/agentDAGService.js`
- Endpoint: `/api/agents/dag`

### 3. Browser Agent
Skill de navegación web autónoma usando Playwright (stub si no está instalado).
- Servicio: `src/services/browserAgentService.js`
- Endpoints: `/api/browser/navigate`, `/api/browser/extract`

### 4. MCP Registry Client
Catálogo local de servidores MCP estándar con capacidad de instalación.
- Servicio: `src/services/mcpRegistryService.js`
- Endpoints: `/api/mcp/registry`, `/api/mcp/registry/installed`

### 5. Usage-Based Billing
Contadores por tenant de invocaciones, tokens y storage con facturación simple.
- Servicio: `src/services/billingService.js`
- Endpoints: `/api/billing/usage`, `/api/billing/invoice`
- Hook en gateway después de cada invoke exitoso.

## Consequences
- +5 tabs en UI enterprise.
- +11 tests y +9 endpoints de smoke.
- Version bump a 2.5.0.
- Portable .bat smokeado OK.

## Evidence
- Build: 168 tests, 167 pass, 0 fail, 1 skip.
- Smoke: 109/109 endpoints OK.
- Portable .bat: health v2.5.0 + gateway + ciclo 3 endpoints OK.
