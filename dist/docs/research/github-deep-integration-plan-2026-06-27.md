# Deep Research GitHub: Integración AaaS para AzurDesk AI v2.3.1+

Fecha: 2026-06-27
Nota metodológica: GitHub API aplicó rate limit en la segunda ronda de extracción. Esta síntesis combina:
- READMEs obtenidos en la ronda anterior (lobehub, deer-flow, anything-llm, cowagent, conductor, openai-agents-python, agentmemory, copaw, openfang, manifest, nadirclaw, agentsmesh, agent-teams-ai, holaOS, harness-sdk).
- Metadata real de API para `agenttier/agenttier` (41 ⭐) y `kcosr/assistant` (86 ⭐).
- Conocimiento técnico actual del dominio.

## Taxonomía de los 36 repos

### 1. Agent Harness / Agent OS (6 repos)
| Repo | Rol clave | Integración propuesta |
|---|---|---|
| **lobehub/lobehub** | Chief Agent Operator, agents 7×24 | Panel "Agent Operator": programar agentes, ver estado, reportes diarios. |
| **bytedance/deer-flow** | Super agent harness: subagents + memory + sandbox + skills | `agentHarnessService.js` con skills registry y sandbox de comandos. |
| **zhayujie/CowAgent** | Personal super assistant: planning + CUA + memory + skills | Adaptar skill hub y 3-tier memory a AzurDesk. |
| **RightNow-AI/openfang** | Agent OS en Rust, "Hands" autónomos | Concepto de Hands: tareas recurrentes sin prompt. |
| **holaboss-ai/holaOS** | Local-first super agent, Electron, 100+ integraciones | Electron wrapper para `.exe` nativo y conector de integraciones. |
| **agenttier/agenttier** (API: 41⭐) | Tiered agent system | Soporte de niveles L1/L2/L3 en agent registry. |

### 2. Orchestración (5 repos)
| Repo | Patrón | Integración |
|---|---|---|
| **conductor-oss/conductor** / Netflix | Durable workflow engine | Añadir retries, timeouts, compensaciones a `orchestratorService.js`. |
| **ComposioHQ/agent-orchestrator** | Parallel coding agents, CI feedback | Modo "squad" para tickets complejos: 2-3 agentes en paralelo. |
| **openai/openai-agents-python** | Handoffs, guardrails, sessions, tracing | Handoffs entre agentes L1→L2→L3; tracing de runs. |
| **steveyegge/gastown** | Agent IDE/orchestrator | UI de timeline de ejecución de agentes. |
| **phuryn/swarm-protocol** | Protocolo de swarm | Ya usado parcialmente; completar con leader election. |

### 3. Agent Teams / Workforce (5 repos)
| Repo | Patrón | Integración |
|---|---|---|
| **AgentsMesh/AgentsMesh** | Runner fleet, workspace isolation | Pool de runners para CUA y agentes desktop. |
| **777genius/agent-teams-ai** | Desktop app, agentes se mensajean, kanban | Mejorar Kanban con threads de agentes y revisiones. |
| **AgentWorkforce/relay** | Relay de tareas entre agentes | Bus de mensajes entre agentes dentro del swarm. |
| **IRISX-AI/IRIS-GO** | Agent workforce en Go | Inspiración para API de workforce. |
| **looptroop-ai/LoopTroop** | Swarm loops | Loop de refinamiento entre agentes. |

### 4. Persistent Memory (2 repos)
| Repo | Patrón | Integración |
|---|---|---|
| **rohitg00/agentmemory** | Confidence scoring, lifecycle, KG, hybrid search | Añadir confidence + lifecycle a Engram. |
| **kcosr/assistant** (API: 86⭐) | Asistente con contexto prolongado | Mejorar context window del orquestador. |

### 5. LLM Router / Cost Optimization (5 repos)
| Repo | Patrón | Integración |
|---|---|---|
| **mnfst/manifest** | Smart model router, ahorra 70% | Feature flag de "smart router" en `aaasRouterService.js`. |
| **NadirRouter/NadirClaw** | Drop-in proxy, simple/complex classifier | Clasificador local de complejidad con cost tracking. |
| **NVIDIA-AI-Blueprints/llm-router** | Blueprint de router multimodal | Arquitectura de router con fallback. |
| **thushan/olla** | Proxy/load balancer LLM | Balanceo de carga entre proveedores. |
| **bitrouter/bitrouter** | Agentic LLM gateway | Gateway con guardrails. |

### 6. Knowledge / RAG / Integrations (4 repos)
| Repo | Patrón | Integración |
|---|---|---|
| **Mintplex-Labs/anything-llm** | All-in-one AI app, RAG, agents, multi-user | Inspiración para UI de knowledge hub. |
| **agentscope-ai/CoPaw** / QwenPaw | Agent SDK con modelos Qwen | Opción de backend alternativo. |
| **strands-agents/harness-sdk** | Model-driven agent SDK | SDK interno para definir agentes vía JSON/YAML. |
| **mindfold-ai/Trellis** | Knowledge graph / memory | Extender GraphRAG con KG. |

### 7. Autonomous Business / Zero Employees (4 repos)
| Repo | Patrón | Integración |
|---|---|---|
| **sentientwave/automata** | Autonomous business agents | Reglas de negocio autónomas. |
| **CompanyHelm/companyhelm** | Company OS | Entidad organizacional en AzurDesk. |
| **Runfusion/Fusion** | AI workforce fusion | Fusión de humanos + agentes en workflows. |
| **aden-hive/hive** | Hive intelligence | Colmena de agentes para soporte. |

### 8. Specialized Apps (3 repos)
| Repo | Patrón | Integración |
|---|---|---|
| **saltbo/agent-kanban** | Kanban para agentes | Panel Kanban con tareas de agentes. |
| **pinchtab/pinchtabx** | Browser agent / tab management | Agente que controla navegador vía CUA. |
| **askalf/dario** | Asistente personal | Inspiración para onboarding wizard. |

## Integraciones prioritarias para AzurDesk AI

### Alta prioridad (impacto comercial inmediato)
1. **Agent Harness** (DeerFlow + CowAgent + OpenFang Hands)
   - Skills registry, scheduling, sandbox.
   - Archivo: `src/services/agentHarnessService.js`.
2. **Smart Cost Router** (Manifest + NadirClaw)
   - Clasificador simple/complex + cost tracking.
   - Archivo: `src/services/costRouterService.js`.
3. **Agent Teams Kanban** (Agent Teams AI + Agent Kanban)
   - Threads de agentes, revisiones, asignación visual.
   - UI: `public/static/app.js`.
4. **Persistent Memory v2** (agentmemory)
   - Confidence, lifecycle, knowledge graph.
   - Mejorar `src/services/engramService.js`.

### Media prioridad
5. **Durable Orchestration** (Conductor) — retries/compensaciones.
6. **OpenAI Agents SDK patterns** — handoffs, guardrails, tracing.
7. **Strands SDK model-driven** — definir agentes vía YAML/JSON.
8. **AnythingLLM-style Knowledge Hub** — UI de RAG unificada.

### Baja prioridad / investigación
9. **holaOS Electron wrapper** — `.exe` nativo sin `pkg`.
10. **Agent Mesh runner fleet** — para escalar CUA.

## Recomendación ejecutiva

Para producción comercial, el siguiente vertical slice debe ser:
1. **Agent Harness + Skills Registry + Scheduling** → automatización real de tareas.
2. **Smart Cost Router** → reducir costos LLM 40-70%.
3. **Agent Teams Kanban** → diferenciador visual para ventas.
4. **Memory v2 + Knowledge Graph** → retención y personalización.

Estas 4 integraciones convierten a AzurDesk AI de "SaaS con agentes" a "Agent Operating System comercial".

## Blocker técnico documentado
- GitHub API rate limit impidió re-extracción masiva. Los READMEs de la primera ronda están en memoria de sesión y en `docs/research/github-deep-research-2026-06-27.md`.
- Se recomienda usar autenticación GitHub (token) para futuras rondas de deep research.
