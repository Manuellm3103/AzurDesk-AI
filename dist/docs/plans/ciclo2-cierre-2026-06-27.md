# Ciclo 2 Cierre al 100% — Plan de Implementación v2.6.2

> **For Hermes:** Ejecutar task-by-task. No detenerse hasta evidence gate verde.

**Goal:** Completar Ciclo 2 original (A2A, MCP expandido, event-driven workers, local LLM router, OTel self-healing) al nivel full-stack producción: UI enterprise, backend real (BullMQ/Redis opcional + local LLM estructura), tests, ADR, CHANGELOG, portable.

**Architecture:** Extender `public/static/app.js` con 5 nuevos renderers enterprise que consumen los endpoints ya existentes. Añadir `bullmq` + `ioredis` como backend opcional de `eventQueueService.js` con fallback SQLite. Refactorizar `localLLMRouterService.js` para soportar descarga/carga de modelos GGUF y ONNX de forma estructurada sin ejecutar inferencia real (placeholder seguro). Todos los cambios verificados vía TDD.

**Tech Stack:** Node.js 24+ ESM, better-sqlite3, vanilla JS frontend, BullMQ/ioredis opcional.

---

## Tareas

### Task 1: UI Enterprise — Tabs y Renderers

**Objective:** Añadir navegación y renderers para A2A Cards, MCP Tools, Local LLM Models, Queue Jobs, OTel Traces/Self-Healing.

**Files:**
- Modify: `public/index.html` (nav links)
- Modify: `public/static/app.js` (renderers + API calls)

**Steps:**
1. Añadir 5 botones en la barra de navegación con `data-view="a2a|mcp|local-llm|queue|otel"`.
2. Implementar `renderA2A()`, `renderMCP()`, `renderLocalLLM()`, `renderQueue()`, `renderOTel()` que llamen a:
   - `GET /api/a2a/cards`, `POST /api/a2a/cards`, `GET /api/a2a/inbox`
   - `POST /api/mcp` (tools/list, tools/call)
   - `GET/POST /api/local-llm/models`, `POST /api/local-llm/route`
   - `GET /api/queue/:queue`
   - `GET /api/otel/traces`, `GET /api/self-heal/actions`
3. Verificar con servidor levantado + screenshot de cada tab.

### Task 2: BullMQ/Redis Backend Opcional

**Objective:** Permitir que `eventQueueService.js` use BullMQ cuando Redis esté disponible, manteniendo SQLite como fallback.

**Files:**
- Modify: `package.json` (añadir `bullmq`, `ioredis` a dependencies)
- Modify: `src/services/eventQueueService.js` (detectar `REDIS_URL` y delegar a BullMQ)
- Create: `src/services/bullmqQueueService.js` (wrapper BullMQ)
- Modify: `src/services/workerService.js` (registrar handlers en BullMQ cuando aplique)
- Test: `tests/workers.mjs` (debe seguir pasando en ambos modos)

**Steps:**
1. Instalar `bullmq` + `ioredis`.
2. Implementar `BullmqQueueService` con `enqueue`, `pop`, `complete`, `fail`, `list`.
3. En `eventQueueService.js`, si `process.env.REDIS_URL` existe, delegar a BullMQ; si no, SQLite.
4. Verificar tests sin Redis (fallback) y con Redis si está disponible.

### Task 3: Local LLM Router Estructura Real

**Objective:** Preparar `localLLMRouterService.js` para modelos GGUF/ONNX: registro con metadata, validación de archivos, descarga de modelos desde URL, endpoint de health por modelo.

**Files:**
- Modify: `src/services/localLLMRouterService.js`
- Modify: `server.mjs` (añadir `GET /api/local-llm/models/:id/health`)
- Test: `tests/local-llm.mjs`

**Steps:**
1. Añadir métodos: `validateModelPath`, `downloadModel(url, dest)`, `modelHealth(id)`.
2. Endpoint `GET /api/local-llm/models/:id/health` devuelve `{ exists: boolean, size: number }`.
3. Generación sigue como placeholder seguro con nota clara.
4. Tests actualizados.

### Task 4: Integración y Verificación

**Objective:** Todo pase build, smoke, real-cases y portable.

**Steps:**
1. `npm run build`
2. `node server.mjs` en background
3. `node tests/smoke.mjs` → 121+/121+
4. `node tests/real-cases.mjs` → 39/39
5. `npm run package:exe`
6. Bump a v2.6.2 en `package.json`, `server.mjs`, CHANGELOG.
7. ADR-026 Ciclo 2 cierre.

---

## Evidence Gate

- `npm run build` → 0 fail
- servidor fresco + smoke 121/121
- real-cases 39/39
- `dist/azurdesk-ai.exe` generado
- CHANGELOG + ADR actualizados
