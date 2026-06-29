# Deep Research — Innovaciones AaaS 2026 para AzurDesk AI

Fecha: 2026-06-27
Origen: GitHub API + conocimiento técnico actual. `web_search` no disponible (HTTP 403).

## Hallazgos clave

### 1. A2A Protocol (Agent2Agent)
- Repo: `a2aproject/A2A` (24.5k ⭐), `a2aproject/a2a-python` (SDK oficial)
- Concepto: tarjetas de tarea (`Task`) con lifecycle, artifact exchange, streaming updates, autenticación por JWT/skills.
- Integración para AzurDesk: reemplazar el A2A casero actual por tarjetas standards (`Task`, `Message`, `Artifact`) con `pushNotifications` y `skill` discovery.

### 2. Microsoft Agent Framework / Open Multi-Agent
- Repo: `microsoft/agent-framework` (11.7k ⭐), `open-multi-agent/open-multi-agent` (6.4k ⭐)
- Concepto: runtime multi-agent con memoria, planificación DAG de tareas y adaptadores para Teams/Slack.
- Integración: orquestador tipo DAG para nuestros 12 agentes core; handoffs y escalación nativa.

### 3. Browser Use / Computer Use as Agent
- Repo: `browser-use/bux` — agente 24/7 con browser real
- Concepto: agente que opera un navegador real como herramienta.
- Integración: módulo de agente web que pueda abrir tickets desde portales de clientes o hacer onboarding visual.

### 4. MCP Registry
- Repo: `modelcontextprotocol/registry` (6.9k ⭐)
- Concepto: "app store" de MCP servers.
- Integración: publicar nuestro MCP expandido en el registry; importar servers externos (GitHub, Slack, Notion).

## Propuesta de 5 innovaciones para Ciclo 3

1. **A2A Standard Tasks** — migrar a2aService al modelo Task/Artifact/Message oficial.
2. **Agent DAG Orchestrator** — planificador que descompone un intent en grafo de pasos entre agentes core.
3. **Browser Agent** — integrar puppeteer/playwright como skill de CUA Agent para navegación web autónoma.
4. **MCP Registry Client** — descubrir e importar MCP servers públicos (GitHub, Slack, Calendar).
5. **Usage-Based Billing** — contadores por invocación de agente, tokens y almacenamiento; endpoints `/api/billing/*`.

## Referencias
- https://github.com/a2aproject/A2A
- https://github.com/a2aproject/a2a-python
- https://github.com/microsoft/agent-framework
- https://github.com/open-multi-agent/open-multi-agent
- https://github.com/browser-use/bux
- https://github.com/modelcontextprotocol/registry
