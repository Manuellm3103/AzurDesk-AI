# ADR-014: Marketing AI Agents

## Estado

Aceptado

## Contexto

Para transformar AzurDesk AI de helpdesk a plataforma de negocio completa, se necesita marketing AI integrado: generación de contenido, diseño de landing pages, branding, trending topics y generación de leads — todo orquestado por el AAAS Router.

## Decisión

Crear `marketingAIService.js` con 5 agentes especializados:

- `content` — posts multicanal con hook y hashtags.
- `webpage` — copy y estructura de landing page.
- `design` — palette, tipografía, voice & tone.
- `trending` — keywords, ángulos y gaps.
- `lead` — campaña completa de lead gen con nurture sequence.

Los outputs se guardan como `marketing_assets` y se agrupan en `marketing_campaigns` con leads y métricas.

## Consecuencias

- Reutiliza el AAAS Router para ejecución de LLM.
- No depende de un único modelo.
- Los assets son auditables, versionables y reutilizables.
- El parseo JSON robusto permite recuperar respuestas imperfectas.

## API

- `POST /api/marketing/agents/run`
- `GET /api/marketing/assets`
- `GET|PATCH /api/marketing/assets/:id`
- `POST|GET /api/marketing/campaigns`
- `POST /api/marketing/campaigns/:id/attach`
- `POST /api/marketing/campaigns/:id/leads`
