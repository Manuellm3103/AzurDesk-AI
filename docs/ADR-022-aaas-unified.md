# ADR-022: AaaS+SaaS Unified Architecture v2.3.0

## Status
Accepted — 2026-06-27

## Context
Se requiere transformar AzurDesk AI de SaaS de helpdesk a plataforma **Agents-as-a-Service + SaaS** con:
- Memoria continua (estilo Mem0/Engram/agentmemory)
- GraphRAG + RAG híbrido
- Swarm de agentes con reputación y leader election
- Router multi-LLM multimodal
- ML/DL para TI
- Computer Use / CUA agent-act
- UI enterprise unificada
- Entregable `.exe`

## Decisiones

1. **Engram Service**: tabla SQLite `engrams` con campos `type`, `content`, `summary`, `vector`, `importance`, `confidence`, `access_count`. Recall híbrido con tokenización/stemming de `natural` + cosine similarity. Consolidación a `memory_summaries`.
2. **Hybrid RAG**: servicio `hybridRAGService.js` que combina GraphRAG (`src/ml/graphRAG.js`), Engram y vector search (`src/ml/similaritySearch.js`).
3. **Swarm Reputation**: utiliza tablas existentes `agent_messages` y `agent_claims`. Leader = agente con más mensajes en canal. Score = claims completadas / mensajes enviados.
4. **Multimodal Router**: `aaasRouterService.js` detecta arrays de contenido con `image_url`/`image` y filtra modelos con regex de capacidades. Payloads normalizados para Ollama, OpenAI, Anthropic, Cohere.
5. **ML Tickets**: `src/ml/ticketML.js` con clasificador simple basado en vocabulario TI. Entrenable en runtime vía `/api/tickets/predict`.
6. **CUA Agent Act**: `src/services/cuaAgentService.js` orquesta `cuaService.js` en bucle de pasos.
7. **Packaging**: script `scripts/build-exe.cjs` intenta `pkg`; si falla, genera launcher `.bat`.

## Consecuencias
- Las tablas nuevas se crean automáticamente vía `src/services/db.js`.
- Los modelos deben declarar `capabilities: ['multimodal']` o incluir "4o", "claude-3", "gemini-1.5", etc. en su id para imágenes.
- El `.exe` depende de `pkg` global; en su ausencia el fallback es un launcher.

## Alternativas rechazadas
- Integrar agentmemory directamente: dependería de MCP externo; preferimos memoria nativa.
- Usar Mem0 self-hosted: añade infra adicional; SQLite con Engram cubre MVP.
- Empaquetar con nexe: menos mantenido que pkg.
