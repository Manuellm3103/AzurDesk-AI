# ADR-017: Innovation Services — Webhooks, Prompt Templates, Notifications

## Estado

Aceptado

## Contexto

AzurDesk AI necesita servicios de plataforma avanzados para diferenciación comercial:
- Notificaciones outbound via webhooks con retries
- Biblioteca de prompt templates reutilizables con variables
- Hub de notificaciones in-app para usuarios

## Decisión

3 servicios nuevos:

1. **webhookService.js** — entrega outbound con hasta 3 retries (0s, 30s, 2min), firma HMAC, filtra por eventos suscritos, estado tracking (pending/delivered/retrying/failed/skipped)
2. **promptTemplateService.js** — CRUD de templates con variables `{{var}}`, categorías, model hints, render y execute vía AAAS router
3. **notificationService.js** — push/list/markRead/markAllRead/unreadCount/delete, soporte user_id opcional, filtrado unread_only

## Consecuencias

- Tenants reciben notificaciones outbound automáticas via webhooks
- Prompts reutilizables y versionados por tenant
- Usuarios reciben notificaciones in-app con badge de no leídas
- 55 endpoints verificados en smoke (de 50 a 55)