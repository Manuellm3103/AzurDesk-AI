# ADR-041: Bun compile — POC exploratory, not production

## Status
Exploratorio (POC) — AzurDesk AI v2.6.12 (2026-06-30).

## Decision
**Bun compile** se intentó como innovation 2 de v2.6.12. Resultado:
- ✅ `bun build --compile --target=bun-windows-x64` produce `azurdesk-ai-bun.exe` (117 MB, standalone Windows x64 PE).
- ✅ El runtime arranca, lee .env, carga módulos.
- ❌ **Blocker**: `bson` (MongoDB driver) usa `node:v8.startupSnapshot` que Bun 1.3.14 todavía no implementa. El server crashea al cargar memoria/mongo.
- ❌ **Blocker secundario**: `better-sqlite3` (binding nativo) requiere node_modules adyacente al .exe porque Bun extrae el .exe a `%TEMP%/~BUN/root/`.

## Why not productize
- Bun 1.3.14 todavía tiene gaps de compatibilidad con ecosystem Node 24 (node:v8, node:test snapshot, etc).
- El stack AzurDesk usa mongodb-driver + bson + better-sqlite3 + node-fetch + 90+ tablas SQLite. Cada una con un binding distinto.
- Empaquetar todo estáticamente requiere reemplazar MongoDB por algo que Bun sí soporte (pg, libsql, etc). Eso es una migración de 1-2 sprints, no un POC.

## Recommendation
Quedarse con **Node 24 LTS + pkg**. Razones:
- Funciona en Windows, macOS, Linux sin recompilar.
- 37.6 MB .exe con todas las deps.
- bson + better-sqlite3 + 90 tablas SQLite corren sin fricción.
- Ya está productizado en v2.6.10/v2.6.11/v2.6.12.

## Future
Re-evaluar Bun 2.x en Q3 2026 cuando:
- `node:v8` esté implementado
- `bun build --compile` soporte `--embed-files node_modules`
- Haya un driver MongoDB oficial Bun-compatible.

## Artifact
- `dist/azurdesk-ai-bun.exe` (117 MB) — POC, **no usar en producción**.
- `dist/launch-azurdesk-bun.bat/sh` — launchers Bun (requieren bun.exe instalado).
