# ADR-030 — AI-Driven Failure Prediction

## Estado
Aceptado — 2026-06-28

## Contexto
AzurDesk AI opera tickets, agentes, pipelines y nodos mesh. Necesitamos anticipar fallos antes de que impacten a clientes, sin depender de modelos LLM costosos ni infraestructura externa.

## Decisión
Construir un motor de predicción local y ligero basado en señales:

- Señales normalizadas a 0..1 usando un umbral de referencia.
- Ponderación fija por tipo de señal:
  - error_rate 25%
  - latency_p95 20%
  - open_tickets 20%
  - overdue_ratio 15%
  - sentiment_negative 20%
- Boost por múltiples señales altas.
- Clasificación en `low/medium/high/critical` con acciones:
  - monitorear, alertar_equipo, escalar_manual, remediar_automatico.
- Persistencia en `failure_predictions` y `failure_signals`.
- `scanTenant()` lee tickets abiertos/vencidos recientes para predicción automática.

## Consecuencias

### Positivas
- Sin dependencias externas.
- Razonablemente interpretable.
- Integración inmediata con telemetry y tickets existentes.
- Base para futuro modelo ML más sofisticado.

### Negativas
- Pesos fijos no se adaptan por tenant ni por histórico.
- No detecta correlaciones no lineales complejas.
- El boost es una heurística simple.

## Alternativas consideradas
- LLM-based risk scoring: costoso y no determinístico.
- Reglas puras (si-entonces): rígido y no agregable.
- Entrenar un clasificador scikit-learn: añade dependencia pesada y requiere dataset etiquetado.

## Implementación
- `src/services/failurePredictionService.js`
- Tablas en `src/services/db.js`
- Endpoints en `server.mjs` bajo `/api/failure-prediction`
- UI en `public/static/app.js` (`renderFailurePrediction`)
- Tests en `tests/failure-prediction.mjs`

## Verificación
- Build verde.
- Smoke cubre signals, predict, scan, predictions y update.
- Real cases cubren predict y listado.
