#!/bin/bash
set -e
export NODE_ENV=production
export PORT=${PORT:-5200}
if [ -z "$JWT_SECRET" ]; then
  echo "JWT_SECRET is required. Generate one with: node -e \"console.log(require('crypto').randomUUID())\""
  exit 1
fi
export DEMO_PASSWORD=${DEMO_PASSWORD:-admin123}
echo "Starting AzurDesk AI on port $PORT..."
node server.mjs
