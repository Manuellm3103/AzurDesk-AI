# ADR-019: Innovaciones Finales de Producción — Analytics, Prompt Optimization, Assets, RBAC

## Estado

Aceptado

## Contexto

AzurDesk AI v2.0.0 ya es una plataforma AAAS self-service con auto-router LLM, multi-proveedor, workflows, SSE, audit, cuotas y webhooks. Para cerrar la calidad comercial, faltan las capacidades de **operación a escala**: observabilidad de costos, optimización continua de prompts, gestión segura de assets y control de acceso granular.

## Decisión

Implementar 4 servicios independientes:

1. **analyticsService.js** — Métricas de uso LLM por tenant/provider/modelo. Tabla `llm_metrics`. Agregados: daily, por provider, por model, top models global, rankings de uso por tenant.
2. **promptOptimizationService.js** — Biblioteca de variantes por template (`prompt_variants`). A/B testing con scoring Bayesian incremental basado en feedback 0-5. Selección automática del mejor variant cuando tiene suficientes muestras (>=3), sino exploración del menos usado.
3. **assetService.js** — Almacenamiento multi-tenant con cuotas estrictas (`tenant_assets`). Directorios aislados por tenant, paths seguros, validación de quota previa al upload, stats de uso.
4. **rbacService.js** — RBAC granular con roles predefinidos: `superadmin`, `admin`, `analyst`, `agent`, `viewer`. Permisos `resource:action` con wildcard soporte. API para grant/revoke permisos custom.

Endpoints integrados:
- `/api/analytics/summary|rankings|top-models`
- `/api/prompts/:id/variants|variants/best|variants/feedback`
- `/api/assets` GET/POST/DELETE
- `/api/rbac/me|check|roles|grant|revoke`

## Consecuencias

- Plataforma operable a escala: costos visibles, prompts optimizados, assets seguros, accesos controlados.
- Build verde 110/111 (1 skip por Obsidian no disponible).
- Smoke 66/66 endpoints operativos.
- AzurDesk AI listo para producción comercial AAAS.
