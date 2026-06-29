# ADR-025: Stalled Session Mitigation

## Status
Accepted

## Context
El usuario pidió explícitamente mitigar "stalled sessions". Las sesiones de chat WebSocket quedaban activas indefinidamente si el cliente se desconectaba sin cerrar.

## Decisiones
1. Añadir `last_heartbeat_at` y `stalled_count` a `chat_sessions`.
2. Actualizar heartbeat en cada mensaje entrante vía WebSocket.
3. Crear `stalledSessionService` con: detect, markStalled, recover, runSweep.
4. Exponer endpoints REST para monitoreo operativo.

## Consequences
- Menor consumo de recursos y mejor visibilidad de sesiones zombies.
- Smoke pasa a 121 endpoints.
