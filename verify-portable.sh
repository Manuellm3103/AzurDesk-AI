#!/bin/bash
# AzurDesk AI portable verification script
set -e

cd "$(dirname "$0")"
export PORT=${PORT:-5200}
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . .env
  set +a
fi

if [ -z "$JWT_SECRET" ]; then
  echo "❌ JWT_SECRET is required. Copy .env.example to .env and set JWT_SECRET."
  exit 1
fi

echo "🔎 Verifying AzurDesk AI on port $PORT..."

# Kill previous node processes on this project (optional safety)
# Windows git-bash may not have pgrep; rely on curl health check.
HEALTH_URL="http://localhost:$PORT/api/health"
if command -v curl >/dev/null 2>&1; then
  if curl -s "$HEALTH_URL" | grep -q '"status":"operational"'; then
    echo "✅ Server is running and healthy"
  else
    echo "⚠️ Server not responding on $HEALTH_URL"
    echo "   Start it with: ./launch-azurdesk.sh (bash) or launch-azurdesk.bat (Windows)"
    exit 1
  fi
else
  echo "⚠️ curl not found; cannot verify server health"
  exit 1
fi

# Optional: run smoke if node available and tests present
if [ -f tests/smoke.mjs ]; then
  echo "🧪 Running smoke tests..."
  node tests/smoke.mjs && echo "✅ Smoke tests passed" || echo "⚠️ Smoke tests failed"
fi

echo "🎉 Portable verification complete."
