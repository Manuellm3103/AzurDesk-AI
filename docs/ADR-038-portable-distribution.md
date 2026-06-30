# ADR-038 — Portable Distribution: Launchers, .env.example y Verify Scripts

## Estado
Aceptado — 2026-06-29

## Contexto
El cliente necesita recibir AzurDesk AI como paquete portable que pueda descomprimir y ejecutar en Windows o Git Bash con mínima configuración.

## Decisión
Estandarizar la entrega portable:

- `.env.example`: variables mínimas requeridas (`NODE_ENV`, `PORT`, `JWT_SECRET`, `DEMO_PASSWORD`, `DB_PATH`, `OLLAMA_HOST`).
- `launch-azurdesk.bat` y `launch-azurdesk.sh`: leen `.env`, validan `JWT_SECRET` y arrancan `node server.mjs` en producción.
- `verify-portable.bat` y `verify-portable.sh`: validan que el servidor responde en `/api/health` y opcionalmente corren smoke tests.
- `README.PORTABLE.md`: instrucciones de instalación rápida.
- `.gitignore`: excluir `.env`, `.env.local`, `*.zip`, `*.tar.gz` para no filtrar secretos ni binarios.

## Consecuencias

### Positivas
- Entrega same-day lista para descomprimir y correr.
- Validación post-instalación simple.

### Negativas
- `JWT_SECRET` debe generarse manualmente antes del primer arranque.
- El zip portable de 57 MB supera el límite recomendado de GitHub (50 MB); para releases futuras se debería usar GitHub Releases Assets.

## Implementación
- `launch-azurdesk.bat`, `launch-azurdesk.sh`
- `verify-portable.bat`, `verify-portable.sh`
- `.env.example`, `README.PORTABLE.md`
- `.gitignore`

## Verificación
- `launch-azurdesk.bat` y `launch-azurdesk.sh` ejecutan sin errores con `.env` válido.
- `verify-portable.*` detectan servidor saludable.
