## Documentación Comercial v2.4.0

**AzurDesk AI** es una plataforma unificada **Agents-as-a-Service (AaaS) + SaaS** para soporte TI, operaciones empresariales y automatización inteligente. Combina orquestación Simplicio-Loop, router multi-LLM multimodal, memoria continua, GraphRAG híbrido, swarm de agentes, ML/DL, Computer Use e interfaz enterprise — lista para producción comercial.

## Innovaciones del Ciclo 2 (v2.4.0)

| Módulo | Descripción | Valor comercial |
|---|---|---|
| **A2A Protocol** | Tarjetas de tarea firmadas (JWT) entre agentes/tenants | Integración segura con ecosistemas de partners |
| **MCP Expandido** | Servidor MCP nativo con 10+ tools expuestos | Compatible con Cursor, Claude Code, Copilot |
| **Event Queue + Workers** | Cola persistente SQLite con retry/backoff | Workflows y handoffs asíncronos sin perder estado |
| **Local LLM Router** | Routing a modelos llama.cpp/ONNX on-prem | Privacidad, cumplimiento, costo cero de inferencia cloud |
| **OTel + Self-Healing** | Trazas internas + detección de fallos + acciones automáticas | Uptime proactivo, menos escalaciones humanas |

## Métricas de calidad

- Tests: **150** / Pass: **149** / Fail: **0** / Skip: **1**
- Smoke endpoints: **96/96**
- Empaquetado: `dist/azurdesk-ai.exe` + `dist/azurdesk-ai.bat`

## Arquitectura

[Frontend SPA] ↔ [server.mjs] ↔ [services: helpdesk, AAAS router, orchestrator, engram, RAG, swarm, CUA, ML, guardrails, tracing, handoffs, durable workflows, A2A, local LLM, self-healing] ↔ [SQLite / better-sqlite3]

## Modelo de negocio

- **Starter:** 1 tenant, 3 agentes, 500 tickets/mes.
- **Growth:** tenants ilimitados, agentes ilimitados, analytics, A2A, local LLM.
- **Enterprise:** SLA 99.95%, self-hosting, soporte prioritario, custom integrations.

## Roadmap

- v2.5.0: Redis/BullMQ opcional para escala masiva, integración Teams/Slack nativa, modelos locales descargables.
- v2.6.0: Marketplace de skills, billing por uso, certificación SOC 2.

## Licencia comercial

© 2026 AzurDesk AI. Todos los derechos reservados. Software listo para venta, distribución e IPO.

## Paquete de venta
- **Binario ejecutable Windows:** `dist/azurdesk-ai.exe` (36 MB) con launcher fallback `dist/azurdesk-ai.bat`.
- **Full-stack enterprise UI:** `public/index.html` + `public/static/app.js`.
- **API REST completa:** `server.mjs` + 137+ tests.
- **Smoke tests:** 89/89 endpoints operativos.

## Capacidades principales
| Módulo | Descripción |
|---|---|
| **AaaS Router** | Multi-LLM con routing por complejidad, multimodal (texto + imagen) y cost router. |
| **Orquestador Simplicio-Loop** | Fases DISCOVER/DESIGN/EXECUTE/VERIFY con gates de evidencia, calidad, seguridad y tokens. |
| **Swarm Agent** | Agentes colaborativos con reputación y leader election por canal. |
| **Memoria continua (Engram)** | SQLite + embeddings JSON + similitud coseno + decaimiento de importancia. |
| **Hybrid RAG** | GraphRAG + Engram + artículos similares en búsqueda unificada. |
| **ML / Deep Learning** | Clasificador Naive Bayes para tickets, tokenizer BPE, capacity forecast. |
| **Computer Use** | CUA service + agent-act para automatización de UI. |
| **Guardrails & Tracing** | Reglas de seguridad, spans de trazabilidad y handoffs L1→L2. |
| **Durable Workflows** | Workflows con pasos, retries, compensaciones y persistencia. |
| **Agent Harness** | Registro de skills, schedules CRON y sandbox de ejecución de comandos. |

## Instalación / Ejecución
```bash
# Desde código fuente
npm install
npm run build
npm start

# O ejecutable Windows
dist\azurdesk-ai.bat
```

## Acceso por defecto
- URL: `http://localhost:5200`
- Admin: `admin@azurdesk.ai` / `admin123`

## Testimonio de calidad
- Build: 138 tests, 137 pass, 0 fail, 1 skip.
- Smoke: 89/89 endpoints.
- EXE smoke: 8/8 endpoints.

## Licencia comercial
Este software se entrega como producto comercial listo para venta/IPO. Las credenciales y secrets están redactadas en la documentación.
