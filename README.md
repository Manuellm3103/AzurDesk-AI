# AzurDesk AI v2.0.0

> **AI-as-a-Service Platform** — Helpdesk multi-tenant con auto-router LLM multimodal, Marketing AI, Workflows, Analytics, RBAC y hardening de producción.

## 🚀 Qué es

AzurDesk AI evolucionó de helpdesk TI a una **plataforma AAAS comercial**: cualquier empresa puede registrarse, configurar sus proveedores LLM, ejecutar agentes de marketing, construir workflows de IA y operar todo desde un dashboard unificado.

## ✨ Capabilities v2.0.0

### Core
- Helpdesk multi-nivel (L1/L2/L3) con tickets, comentarios, historial y SLA
- Kanban board con priorización inteligente
- Knowledge Base con RAG, entidades y relaciones
- Chat AI con intent + sentiment
- Computer Use (CUA) para automatización visual

### AAAS Platform
- **Auto-router LLM multimodal**: selecciona proveedor/modelo según estrategia (balanced, cheap, fast, quality)
- **Multi-proveedor**: Ollama, Ollama Cloud, Anthropic, Gemini, Groq, Cohere, OpenRouter, OpenAI-compatible
- **Self-service signup**: registro público con planes free/starter/pro/enterprise
- **AI Workflow Builder**: nodos prompt, condition, branch, output, delay, http, aggregate
- **SSE streaming**: `/api/aaas/stream` para respuestas en tiempo real
- **Prompt Template Library + A/B Optimization**: variantes con scoring automático
- **Tenant Asset Management**: almacenamiento con cuotas estrictas
- **Advanced RBAC**: superadmin/admin/analyst/agent/viewer + permisos granulares

### Marketing AI
- Content Agent, Web Page Agent, Design Agent, Trending Agent, Lead Gen Agent
- Campaign Builder visual con múltiples agentes
- Assets y leads organizados por campaña

### Platform Services
- API Keys programáticas con scopes
- Audit Logs inmutables
- Quotas y rate limiting por tenant
- Webhook Deliveries con retries
- OpenAPI 3.1 auto-documentado en `/api/docs`
- Analytics de costos, tokens, latencia
- Telemetry Dashboard en vivo via WebSocket
- Predictive Incident Radar

### Hardening
- Cifrado AES-256-GCM
- Graceful shutdown
- Rate limiting 300 req/min con paths exentos
- XSS protection
- JWT en WebSocket
- Error 500 sin stack trace en producción
- CI/CD pipeline en `.github/workflows/ci.yml`

## 📦 Instalación

```bash
npm install
npm run build   # checks + tests
npm start       # server.mjs en PORT=5200
```

## 🔐 Variables de entorno

| Variable | Descripción | Requerida |
|---|---|---|
| `JWT_SECRET` | Secreto para firmar tokens (32+ chars) | Sí |
| `AAAS_MASTER_KEY` | Clave maestra para cifrar providers | Sí |
| `PORT` | Puerto HTTP (default 5200) | No |
| `NODE_ENV` | `production` oculta errores detallados | Recomendado |
| `MAX_BODY_SIZE` | Límite payload bytes (default 1MB) | No |

## 🧪 Testing

```bash
npm run checks  # syntax check
npm test        # 110 tests
npm run smoke   # 67/67 endpoints
npm run build   # todo junto
```

## 📊 Dashboard

Navegación principal:
- 🧠 AAAS — configuración de proveedores y generación
- 🚀 Marketing AI — Campaign Builder
- 🛰️ AAAS Ops — Analytics, Workflows, Assets, RBAC
- ⚙️ Platform — API Keys, Quota, Audit
- 🔍 API Explorer — OpenAPI spec completa

## 📄 Licencia

MIT — AzurDesk AI v2.0.0
