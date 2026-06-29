@echo off
setlocal
set NODE_ENV=production
set PORT=5200
if exist .env (for /f "usebackq tokens=*" %%a in (`.env`) do set "%%a")
if "%JWT_SECRET%"=="" (
  echo JWT_SECRET is required. Generate one with: node -e "console.log(require('crypto').randomUUID())"
  echo Copy it into .env or set JWT_SECRET environment variable.
  exit /b 1
)
if "%DEMO_PASSWORD%"=="" set DEMO_PASSWORD=admin123
echo Starting AzurDesk AI on port %PORT%...
node server.mjs
pause
