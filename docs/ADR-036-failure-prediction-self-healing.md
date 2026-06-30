# ADR-036 — Failure Prediction + Self-Healing Loop Automático

## Estado
Aceptado — 2026-06-29

## Contexto
Operar agentes IA a escala genera señales de error (latencia, fallos de pasos, tickets abiertos). Necesitamos detectar riesgo antes de que impacte al cliente y aplicar remediations determinísticas automáticamente.

## Decisión
Combinar dos servicios nativos:

1. `failurePredictionService.js`: modelo de scoring ponderado sobre señales. Escala `low/medium/high/critical` y recomienda acción.
2. `selfHealingService.js`: registro de spans tipo OpenTelemetry, detección de fallas recientes y mapa a remediations.

Nuevos endpoints:
- `POST /api/self-healing/heal` → detecta y aplica remedios.
- `POST /api/self-healing/actions/:id` → aplica un remediation manual.
- `GET /api/self-healing/actions` → lista acciones de healing.

UI: vista `failure-prediction` renombrada a **AI-Driven Failure Prediction + Self-Healing**.

## Consecuencias

### Positivas
- Detección proactiva sin infraestructura externa.
- Remedios automáticos para rutas comunes (fallback LLM, reasignar tarea, retry step).
- Auditoría de señales y predicciones en SQLite.

### Negativas
- Remedios son heurísticos, no genéricos para todo tipo de fallo.
- Modo auto-remediation puede ejecutar acciones sin supervisión humana.

## Implementación
- `src/services/failurePredictionService.js`
- `src/services/selfHealingService.js` (ampliado con `applyHealing`)
- Endpoints en `server.mjs`
- UI en `public/static/app.js`
- Tests `tests/failure-prediction.mjs` y `tests/self-healing.mjs`

## Verificación
- `npm test` ✅ (failurePrediction + selfHealing)
- `npm run smoke` ✅ (self-heal status)
- `node tests/real-cases.mjs` ✅ (failure prediction + self-healing)
