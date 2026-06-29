#!/bin/bash
set -e
export NODE_ENV=production
export PORT=${PORT:-5200}
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . .env
  set +a
fi
if [ -z "$JWT_SECRET" ]; then
  echo "JWT_SECRET is required. Generate one with: node -e \"console.log(require('crypto').randomUUID())\""
  echo "Copy it into .env or set JWT_SECRET environment variable."
  exit 1
fi
export DEMO_PASSWORD=${DEMO_PASSWORD:-admin123}
echo "Starting AzurDesk AI on port $PORT..."
node server.mjs
