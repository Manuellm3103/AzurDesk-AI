# ADR-015: Production Hardening

## Estado

Aceptado

## Contexto

Tras la conversión a AAAS y Marketing AI, AzurDesk AI necesita endurecimiento de producción comercial. Los reviews paralelos (code reuse, quality, efficiency, security, test coverage, production readiness) identificaron:

- JWT_SECRET con fallback inseguro
- API keys sin cifrado adecuado
- Sin limite de payload (DoS por memoria)
- Error 500 filtra stack traces
- JSON.parse desprotegidos en multiples servicios
- Sin graceful shutdown
- XSS via innerHTML en frontend
- parseJsonRobust duplicado
- Health endpoint sin checks reales

## Decisión

Aplicar fixes SAFE de alto impacto:

1. **JWT_SECRET**: warn si no configurado, fallback solo desarrollo, `effectiveJwtSecret` en todas las rutas
2. **MAX_BODY_SIZE**: limite configurable (default 1MB), error 413
3. **Graceful shutdown**: SIGTERM/SIGINT cierran ChatService, TelemetryService y HTTP server
4. **Health endpoint**: expone `checks.db` y `checks.jwt`
5. **Error 500**: `detail` solo en `NODE_ENV !== 'production'`
6. **safeJson centralizado**: contractReviewService y telemetryService migrados
7. **parseJsonRobust**: movido a `_utils.js`, marketingAIService importa de ahí
8. **randomId helper**: `_utils.js` para IDs consistentes
9. **XSS helper**: `esc()` en app.js
10. **CI pipeline**: inyecta `JWT_SECRET`, `AAAS_MASTER_KEY`, `NODE_ENV=production`

## Consecuencias

- Producción segura con secrets configurables
- DoS mitigado con limite de payload
- No hay fugas de información en errores
- JSON parsing robusto en toda la app
- CI valida con configuración de producción