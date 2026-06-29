# ADR-031 — ReBAC / Zanzibar-lite Authorization

## Estado
Aceptado — 2026-06-28

## Contexto
AzurDesk AI ya tiene ABAC (`/api/abac`) y RBAC de roles predefinidos. Para escenarios enterprise de granularidad fina necesitamos autorización basada en relaciones: "el usuario U es viewer del documento D", "el grupo G es editor de la carpeta C". Este modelo escala mejor que listas de control de acceso tradicionales y permite políticas como owner implica editor.

## Decisión
Implementar un motor ReBAC (Relationship-Based Access Control) de tipo Zanzibar-lite en SQLite:

- `authz_relations`: almacena tuples `object_type:object_id#relation@user_type:user_id`.
- `authz_checkpoints`: almacena zookies para consistencia de snapshots.
- Operaciones:
  - `write`: idempotente; rechaza duplicados exactos.
  - `deleteTuple`: elimina un tuple específico.
  - `check`: verifica acceso directo, por userset de un nivel (grupos), o herencia de owner.
  - `expand`: lista todos los sujetos de una relación sobre un objeto.
  - `snapshot`: genera un zookie criptográfico.

## Consecuencias

### Positivas
- Modelo de autorización flexible y auditado.
- Sin dependencias externas.
- Compatible con ABAC existente: se pueden consultar ambos gates.
- Base para futuro namespace configuration y ACL recursivas.

### Negativas
- Sin evaluación recursiva profunda de usersets anidados (solo 1 nivel).
- Sin namespace config ni consistency model real de Zanzibar.
- Zookie es un hash, no un token de versión distribuida.

## Alternativas consideradas
- Usar OpenFGA/S SpiceDB: añade infraestructura extra.
- Mantener solo ABAC: no cubre herencia por grupo ni owner-implies-editor de forma natural.

## Implementación
- `src/services/authorizationService.js`
- Tablas en `src/services/db.js`
- Endpoints en `server.mjs` bajo `/api/authz`
- UI en `public/static/app.js` (`renderReBAC`)
- Tests en `tests/rebac.mjs`

## Verificación
- Build verde.
- Smoke incluye write, allow, deny, list y snapshot.
- Real cases incluyen write tuple, owner-implies-viewer y listado.
