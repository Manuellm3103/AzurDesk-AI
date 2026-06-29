@echo off
setlocal
set NODE_ENV=production
set PORT=5200
if "%JWT_SECRET%"=="" (
  echo JWT_SECRET is required. Generate one with: node -e "console.log(require('crypto').randomUUID())"
  exit /b 1
)
if "%DEMO_PASSWORD%"=="" set DEMO_PASSWORD=admin123
echo Starting AzurDesk AI on port %PORT%...
node server.mjs
pause
