# AzurDesk AI Portable

## Instalación rápida

1. Descomprime el `.zip`.
2. Copia `.env.example` a `.env` y genera `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomUUID())"
   ```
3. Instala dependencias:
   ```bash
   npm install
   ```
4. Inicia el servidor:
   - **Windows:** doble click en `launch-azurdesk.bat`
   - **Linux/macOS/Git Bash:** `./launch-azurdesk.sh`
5. Abre `http://localhost:5200`.
6. Login demo: `admin` / `admin123` (o el valor de `DEMO_PASSWORD`).

## Verificación

- **Windows:** `verify-portable.bat`
- **Git Bash/WSL:** `./verify-portable.sh`

## Requisitos

- Node.js 20+
- npm o equivalente
- Para Ollama local: `OLLAMA_HOST` en `.env`

## Soporte

Ver `CHANGELOG.md` y `SIMPLICIO-REPORT-v2.6.8.md` para historial de cambios.
