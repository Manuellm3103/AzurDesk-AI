#!/bin/bash
set -e
export NODE_ENV=production
export PORT=${PORT:-5200}
export JWT_SECRET=${JWT_SECRET:?JWT_SECRET es requerido}
export DEMO_PASSWORD=${DEMO_PASSWORD:-admin123}

npm ci --only=production
npm run checks
node server.mjs
