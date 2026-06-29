# AzurDesk AI — API Reference

Base URL: `http://localhost:5200/api` (o el host configurado).
Auth: Bearer token vía `Authorization: Bearer <token>`.

## Auth

### POST /api/auth/login
```json
{ "email": "admin@azurdesk.ai", "password": "admin123" }
```
Response: `{ success: true, token }`

## Helpdesk / Tickets

### POST /api/tickets
Crea un ticket. El clasificador ML asigna prioridad, nivel y tags.
```json
{
  "requester_email": "a@b.com",
  "requester_name": "A",
  "subject": "Problema de red",
  "body": "La red principal está caída en la oficina CDMX"
}
```

### GET /api/tickets
Lista tickets del tenant. Query params: `status`, `priority`, `assignee_id`, `limit`, `offset`.

### GET /api/tickets/:id
Detalle del ticket.

### POST /api/tickets/:id/escalate
Escalado manual. Body: `{ level, reason }`.

### POST /api/tickets/:id/move
Mueve ticket entre estados Kanban. Body: `{ status }`.

### GET /api/helpdesk/metrics
Métricas del helpdesk.

### GET /api/helpdesk/kanban
Board Kanban con columnas de tickets.

## Agents

### GET /api/agents
Lista agentes.

### POST /api/agents
Crea agente. Body: `{ name, role, level, skills }`.

### GET /api/agents/health
Health snapshot de la fleet.

### GET /api/agents/metrics
Métricas de agentes.

### GET /api/agents/rebalance/recommend
Recomendaciones de rebalanceo de carga.

### POST /api/agents/rebalance
Aplica rebalanceo recomendado.

### GET /api/agents/rebalance/logs
Historial de rebalances.

## Automatón / Triggers

### GET /api/automaton/rules
Lista reglas.

### POST /api/automaton/rules
Crea regla. Body:
```json
{
  "name": "Crítico → webhook",
  "description": "...",
  "condition": { "priority": "critica" },
  "actions": [{ "type": "webhook", "params": { "url": "...", "message": "..." } }],
  "priority": 10,
  "enabled": true
}
```
Tipos de acción: `webhook`, `email`, `escalate_level`, `create_incident`, `assign_to_agent`.

### GET/PUT/DELETE /api/automaton/rules/:id
CRUD de regla individual.

### POST /api/automaton/rules/:id/run
Ejecuta regla manualmente sobre el último ticket o uno dado.

### GET /api/automaton/outbox
Mensajes/envíos pendientes generados por reglas.

## Agent Mesh Discovery

### POST /api/mesh/nodes
Publica o actualiza un nodo experto.
```json
{
  "agent_id": "net-01",
  "name": "Especialista Red",
  "role": "specialist",
  "level": 3,
  "skills": ["network", "firewall"],
  "endpoint": "http://..."
}
```

### GET /api/mesh/nodes
Lista nodos activos.

### POST /api/mesh/nodes/:id/heartbeat
Heartbeat de salud. Body: `{ availability, reputation, metrics }`.

### DELETE /api/mesh/nodes/:id
Desactiva nodo.

### POST /api/mesh/rank
Rankea nodos para un ticket. Body:
```json
{ "ticket": { "tags": ["network"], "level": 3 } }
```

### POST /api/mesh/assign
Asigna ticket a nodo. Body: `{ ticket_id, node_id, reason, score }`.

## Capacity Planner

### GET /api/capacity/forecast?hours=4
Forecast de capacidad. Response:
```json
{
  "forecast": {
    "incoming_rate": 2.5,
    "projected_workload": 10,
    "available_capacity": 8,
    "utilization": 1.25,
    "agents_needed": 1,
    "risk": "high"
  }
}
```

## Legal Case Management

### POST /api/legal/cases
Crea caso legal. El servicio infiere risk score, prioridad, SLA y nivel de aprobación.
```json
{
  "title": "Demanda laboral",
  "summary": "Ex empleado demanda por despido injustificado",
  "type": "litigation",
  "requester_email": "rrhh@corp.com",
  "requested_amount": 120000,
  "opposing_party": "Juan Pérez",
  "jurisdiction": "CDMX"
}
```
Tipos: `contract`, `litigation`, `compliance`, `ip`, `employment`, `corporate`.

### GET /api/legal/cases
Lista casos. Query params: `status`, `type`, `priority`, `owner_id`, `limit`, `offset`.

### GET /api/legal/cases/:id
Detalle del caso incluyendo tareas, notas y documentos.

### POST /api/legal/cases/:id/advance
Avanza al siguiente estado legal.

### POST /api/legal/cases/:id/approve
Aprueba/rechaza caso. Body:
```json
{ "approver_id": "partner-uuid", "decision": "approved", "notes": "Aprobado para proceder" }
```
Requiere que el usuario tenga `level` ≥ `approval_level` del caso.

### GET/POST /api/legal/cases/:id/tasks
Gestión de tareas del caso.

### GET/POST /api/legal/cases/:id/notes
Notas del caso (internas/públicas).

## AI / LLM

### POST /api/ai/reply
Genera respuesta sugerida para un ticket.

### POST /api/ai/rag
RAG sobre base de conocimiento.

### GET /api/llm/models
Modelos disponibles.

### GET /api/llm/stats
Estadísticas de uso.

## Swarm Protocol

### GET /api/swarm/status
Estado del equipo.

### POST /api/swarm/claim
### POST /api/swarm/heartbeat
### POST /api/swarm/complete
### GET/POST /api/swarm/messages

## Memory & KB

### GET /api/memory/graph
### POST /api/memory
### POST /api/kb/graph
### GET /api/kb/search

## Ollama Cloud

### POST /api/ollama-cloud/signin
### GET /api/ollama-cloud/account
### POST /api/ollama-cloud/check
### GET /api/ollama-cloud/models
### POST /api/ollama-cloud/generate

## Sites / Web Builder

### POST /api/sites
### GET /api/sites/:id/export
### POST /api/pages

## Documents OCR

### GET /api/documents
### POST /api/documents (multipart)

## Review / Orchestrator

### POST /api/review
### POST /api/orchestrator/runs
### GET /api/orchestrator/runs/:id

## AAAS — LLM Router

### POST /api/aaas/providers
Configura cuenta de proveedor LLM.
```json
{
  "name": "Ollama Cloud",
  "kind": "ollama_cloud",
  "base_url": "https://ollama-cloud.example.com",
  "api_key": "[REDACTED]",
  "models": [{ "id": "ministral-3:8b-cloud", "quality": 0.75, "cost_per_1m": 0, "latency_ms": 1200, "complexity": ["low","medium"] }]
}
```

### GET /api/aaas/providers
Lista proveedores del tenant (sin exponer API keys).

### PUT /api/aaas/providers/:id
Actualiza proveedor.

### DELETE /api/aaas/providers/:id
Elimina proveedor.

### GET /api/aaas/models
Modelos disponibles para el tenant.

### POST /api/aaas/generate
Generación via router.
```json
{
  "prompt": "Resume el SLA de red",
  "strategy": "balanced",
  "preferred": "Ollama Cloud",
  "maxCostPer1M": 1.0
}
```

### GET /api/aaas/usage
Estadísticas de uso y costos por proveedor.

## Marketing AI Agents

### POST /api/marketing/agents/run
Ejecuta agente. `kind`: content, webpage, design, trending, lead.
```json
{
  "kind": "content",
  "ctx": { "brand": "AzurDesk", "topic": "AI para helpdesk", "audience": "CTOs", "channels": ["linkedin","blog"] }
}
```

### GET /api/marketing/assets
### GET /api/marketing/assets/:id
### PATCH /api/marketing/assets/:id

### POST /api/marketing/campaigns
### GET /api/marketing/campaigns
### POST /api/marketing/campaigns/:id/attach
### POST /api/marketing/campaigns/:id/leads

## Obsidian

### GET /api/obsidian/notes
