@echo off
setlocal
cd /d "%~dp0"
set PORT=5200
if exist .env (for /f "usebackq tokens=*" %%a in (`.env`) do set "%%a")

if "%JWT_SECRET%"=="" (
  echo ❌ JWT_SECRET is required. Copy .env.example to .env and set JWT_SECRET.
  exit /b 1
)

echo 🔎 Verifying AzurDesk AI on port %PORT%...

curl -s http://localhost:%PORT%/api/health | findstr "operational" > nul
if %errorlevel%==0 (
  echo ✅ Server is running and healthy
) else (
  echo ⚠️ Server not responding on http://localhost:%PORT%/api/health
  echo    Start it with: launch-azurdesk.bat
  exit /b 1
)

if exist tests\smoke.mjs (
  echo 🧪 Running smoke tests...
  node tests\smoke.mjs
  if %errorlevel%==0 (echo ✅ Smoke tests passed) else (echo ⚠️ Smoke tests failed)
)

echo 🎉 Portable verification complete.
