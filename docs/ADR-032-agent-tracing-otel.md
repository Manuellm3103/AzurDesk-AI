# ADR-032: Agent Tracing OpenTelemetry-like con Costos por Modelo/Proveedor

## Estado
Aceptado

## Contexto
Como parte de la innovación v2.6.8, necesitamos agregar capacidades de trazabilidad (tracing) para agentes de IA, similar a OpenTelemetry, que permita:
- Iniciar y finalizar spans (trazas) asociadas a operaciones de agentes (llamadas a LLM, uso de herramientas, flujos de trabajo).
- Calcular el costo de cada span basado en el modelo y proveedor utilizado (tokens de entrada/salida).
- Almacenar trazas y agregados diarios por tenant para análisis y facturación.
- Exponer endpoints API para iniciar, finalizar, consultar traces y actualizar costos de modelos.
- Añadir una pestaña en la UI para visualizar y interactuar con el sistema de trazado.

Esta característica se basa en el servicio existente de trazabilidad (tracingService.js) pero se especializa para agentes y costos de modelos.

## Decisión
Implementaremos un nuevo servicio `agentTracingService.js` que:
1. Gestionará tablas SQLite: `agent_traces`, `agent_traces_aggregates`, `agent_traces_model_costs`.
2. Proveerá métodos para iniciar y finalizar spans, calcular costos usando una tabla de costos de modelos (con valores predeterminados para proveedores comunes).
3. Actualizará agregados diarios por tenant (costo total, latencia media, conteos de éxito/error).
4. Expondrá los siguientes endpoints en `server.mjs`:
   - `POST /api/traces/start` : inicia un span y devuelve su ID.
   - `POST /api/traces/end` : finaliza un span y actualiza su estado, latencia y costo.
   - `GET /api/traces` : consulta trazas por tenant con filtros opcionales (trace_id, rango de fechas, operación, estado, límite).
   - `POST /api/traces/model-cost` : actualiza o inserta el costo por 1K tokens de entrada/salida para un modelo y proveedor.
5. Añadiremos un renderer `renderAgentTracing` en `public/static/app.js` que proporciona una interfaz para:
   - Iniciar un span (con campos opcionales: trace_id, parent_span_id, agent_id, agent_type, operación requerida, modelo/proveedor, tokens, atributos).
   - Finalizar un span (por ID, estado, atributos adicionales).
   - Consultar trazas (por trace_id opcional y límite).
   - Actualizar el costo de un modelo (proveedor, nombre, costo entrada/salida por 1K tokens, moneda).
   - Mostrar el resultado de las operaciones en un bloque `<pre>`.

## Consecuencias
### Positivas
- Visibilidad detallada del rendimiento y costo de las operaciones de agentes IA.
- Base para facturación basada en uso real de tokens.
- Integración con el sistema de alertas causales (ya existente) para detectar anomalías en latencia o costo.
- Facilita la depuración y optimización de flujos de trabajo de agentes.

### Negativas
- Aumento de la complejidad del esquema de la base de datos (tres nuevas tablas).
- Sobrehead mínimo de escritura en cada span iniciado y finalizado.
- Necesidad de mantener actualizada la tabla de costos de modelos (se proveen valores predeterminados).

## Implementación
- El servicio se inicializa creando las tablas si no existen y poblando la tabla de costos de modelos con valores predeterminados.
- Los spans se almacenan con un ID único (UUID), trace_id, span_id, parent_span_id, tenant_id, agent_id, agent_type, operation, model_provider, model_name, input_tokens, output_tokens, cost, latency_ms, status, attributes (JSON), start_time, end_time, created_at.
- Los agregados diarios se actualizan al finalizar cada span.
- Los endpoints están protegidos por el middleware de autenticación existente (se asume que el tenant_id se extrae del token o del contexto de la solicitud; en la implementación actual usamos una cookie simplificada para la UI, pero en el backend deberíamos extraerlo del usuario autenticado).
- La UI usa las funciones auxiliares existentes (`api`, `esc`, etc.) y sigue el mismo patrón de los otros renderers.

## Pruebas
- Se añadieron tests unitarios en `tests/agent-tracing.mjs` que verifican:
  - Creación de un span.
  - Finalización de un span.
  - Cálculo correcto de costos para un modelo conocido (gpt-4).
  - Recuperación de trazas por tenant.
  - Actualización de agregados diarios.
- Los tests pasan después de limpiar las tablas relevantes antes de cada prueba.

## Notas
- La implementación actual asume que el tenant_id se obtiene de una cookie para simplificar la UI. En un entorno de producción, el backend debería extraer el tenant_id del token JWT o del contexto de autenticación.
- La tabla de costos de modelos puede ser actualizada en tiempo real mediante el endpoint `/api/traces/model-cost`.
- El atributo `latency_ms` se calcula como la diferencia entre el tiempo de finalización y el tiempo de inicio.
- El atributo `cost` se calcula en el momento de iniciar el span usando los tokens de entrada/salida proporcionados y el costo por 1K tokens del modelo/proveedor. Si se actualiza el costo del modelo después de iniciar el span, el costo del span no se recalcula (es una captura en el momento de inicio). Esto es intencional para mantener la inmutabilidad de los eventos pasados.