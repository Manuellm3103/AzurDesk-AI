# ADR-010: AI Contract Review en AzurDesk AI

## Estado

Aceptado

## Contexto

El módulo Legal Case Management ya permite crear casos, avanzar estados, gestionar tareas y aprobaciones. Un caso de tipo `contract` es el más común: revisar un acuerdo comercial, SLA, NDA, contrato de servicios. El equipo legal necesita una primera pasada rápida que señale cláusulas de riesgo antes de que un abogado revise el documento completo.

## Decisión

Agregar un servicio `contractReviewService.js` que:

- Reciba texto plano de un contrato (pegado desde UI o extraído de documento en el futuro).
- Detecte cláusulas de riesgo con patrones regex determinísticos en español.
- Calcule un score global y un nivel de riesgo (`low`, `medium`, `high`, `critical`).
- Guarde el resultado en `contract_reviews`, ligado opcionalmente a un `legal_cases.id`.
- Exponga endpoints REST bajo `/api/legal/contracts/reviews`.
- Se integre en la vista de detalle de un caso legal (`viewLegalCase`).

No depende de LLM. El motor es 100% offline y testeable.

## Cláusulas de riesgo soportadas

| ID | Nombre | Severidad |
|---|---|---|
| indemnity | Cláusula de indemnidad / responsabilidad ilimitada | high |
| confidentiality | Confidencialidad excesiva | medium |
| termination | Rescisión unilateral o sin causa | high |
| ip_assignment | Asignación amplia de propiedad intelectual | high |
| exclusivity | Exclusividad amplia o no-compete extendido | medium |
| penalties | Penalizaciones desproporcionadas | medium |
| liability_cap | Tope de responsabilidad bajo | medium |
| jurisdiction | Jurisdicción adversa | low |

Cada cláusula define un conjunto de patrones regex en español. Se permiten variaciones legales comunes (por ejemplo, "rescindir", "resolución del contrato", "caducidad", "extinción anticipada" para la misma categoría).

## Fórmula de score

- **Por cláusula**: `score = min(1, weight + bonus)`, donde:
  - `weight` es el peso base de la cláusula (0.45–0.85 según severidad).
  - `bonus = min(1 - weight, (hits - 1) * 0.08)` por cada patrón adicional que coincida.
  - `matched = hits > 0`.
- **Score global**: promedio de los scores de las cláusulas que hicieron match.
  - `overall_score = 0` si ninguna cláusula coincide.
- **Nivel de riesgo**:
  - `critical`: score ≥ 0.7
  - `high`: score ≥ 0.45
  - `medium`: score ≥ 0.25
  - `low`: score < 0.25

## Validaciones y límites

- `text` es obligatorio, no vacío y tipo `string`; en otro caso se lanza `400`.
- Longitud máxima: 50,000 caracteres.
- Si se envía `case_id`, debe existir un `legal_cases` con ese `id` y `tenant_id`; en otro caso se lanza `400`.
- `GET /api/legal/contracts/reviews` devuelve máximo 100 registros por defecto (límite máximo 500), ordenados por `created_at DESC`, con `offset` opcional.
- Las revisiones son inmutables: no hay endpoints de update. Solo `DELETE` para roles `admin`/`lawyer`.
- Subida de archivos (PDF/DOCX) queda fuera del MVP por no duplicar lógica de extracción; se integrará reutilizando `documentService` cuando corresponda.

## Alternativas consideradas

1. **LLM-based contract review**
   - Pros: más flexible, detecta matices.
   - Contras: requiere Ollama Cloud conectado, costo por token, no determinístico, difícil de testear.
   - Decisión: descartado para MVP. Se puede agregar como mejora posterior con fallbacks a los patrones regex.

2. **Integrar el análisis dentro de `legalCaseService.js`**
   - Pros: menos archivos.
   - Contras: mezcla responsabilidades. Un caso legal no es lo mismo que una revisión de contrato; un caso puede tener múltiples revisiones.
   - Decisión: servicio separado con su propia tabla.

3. **Solo frontend con análisis en el cliente**
   - Pros: sin carga de servidor.
   - Contras: no se guarda historial, no se comparte entre abogados, no se liga al caso.
   - Decisión: backend con persistencia.

## Consecuencias

- Nuevos artefactos: `src/services/contractReviewService.js`, `tests/contract-review.mjs`, endpoints REST, UI en `viewLegalCase`.
- Tabla `contract_reviews` en SQLite.
- Smoke tests cubren la ruta completa.
- El score es transparente y explicable: cada hallazgo incluye qué patrón coincidió, cuántas veces y un snippet.

## Riesgos y mitigaciones

- **Falsos positivos**: los regex son anchos. Mitigación: severity por cláusula y snippet para contexto; el abogado siempre decide.
- **Idioma**: solo español por ahora. Mitigación: documentar y agregar `es/en` en `metadata` si se expande.
- **Escapar HTML**: los snippets se guardan como texto plano. El frontend los muestra como texto; no se usa `innerHTML` con el snippet.

## Fecha

2026-06-26
