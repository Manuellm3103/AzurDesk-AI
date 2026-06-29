# ADR-011: Predictive Incident Radar

## Estado

Aceptado

## Contexto

AzurDesk AI ya acumula señales operativas: tickets con prioridad, SLA, asignación, sentimiento, nivel de escalamiento; casos legales con due date, owner, risk_score, approval_level; y agentes con métricas de carga. Operaciones y legal necesitan una vista consolidada de qué items están más próximos a convertirse en incidentes críticos en las siguientes 4 horas.

## Decisión

Agregar un servicio `radarService.js` que:

- Lea tickets abiertos y casos legales activos del tenant.
- Calcule un score de explosión por item combinando señales normalizadas.
- Devuelva una lista ordenada por score descendente con las señales descompuestas.
- Exponga `GET /api/radar`.
- Renderice una vista en el dashboard llamada "🚨 Radar".

No requiere tabla nueva: es computación en vivo sobre datos existentes.

## Señales y pesos

### Tickets

| Señal | Peso | Cómo se calcula |
|---|---|---|
| priority | 0.35 | `critica=1.0, alta=0.75, media=0.45, baja=0.2` |
| time_pressure | 0.25 | vencido=1.0, dentro de 4h=0.8-1.0, lejos=0-0.5 |
| assigned_risk | 0.20 | sin asignar=1.0, agente inexistente=0.85, offline/busy=0.7, burnout=0.65, normal=0.2 |
| escalation_risk | 0.10 | valor numérico del ticket |
| sentiment_risk | 0.05 | `max(0, -sentiment)` |
| level | 0.05 | `level >= 2` suma 0.05 |

### Casos legales

| Señal | Peso | Cómo se calcula |
|---|---|---|
| priority | 0.25 | `critical=1.0, high=0.75, medium=0.45, low=0.2` |
| time_pressure | 0.25 | igual que tickets |
| owner_risk | 0.20 | sin owner=0.85, con owner=0.2 |
| case_risk | 0.20 | `risk_score` del caso |
| approval_risk | 0.10 | `approval_level >= 3` suma 0.10 |

## Score y clasificación

- `score = suma ponderada de señales`, truncado a 1.
- Clasificación por score:
  - `critical`: score ≥ 0.75
  - `high`: score ≥ 0.55
  - `medium`: score ≥ 0.35
  - `low`: score < 0.35

## API

- `GET /api/radar`
  - Devuelve `{ success: true, radar: { tenant_id, generated_at, horizon_hours: 4, total, critical, high, items: [...] } }`.
  - Máximo 50 items en la respuesta.

## UI

- Nueva pestaña "🚨 Radar".
- Muestra resumen (total, críticos, altos) y lista con score, tipo, prioridad, vencimiento y descomposición de señales.

## Consecuencias

- No se añade persistencia; el radar es siempre freso.
- Fácil de extender: se pueden añadir más señales (mesh health, capacity forecast) sin cambiar schema.
- Transparente: cada item incluye las señales que contribuyeron al score.

## Riesgos y mitigaciones

- **Falso positivo**: un ticket crítico pero resuelto no aparece porque se filtran `status`.
- **Falso negativo**: un ticket con SLA lejano pero con sentimiento muy negativo puede subir por `sentiment_risk`.
- **Tenant boundary**: todas las queries incluyen `tenant_id`.

## Fecha

2026-06-26
