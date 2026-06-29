#!/bin/bash
set -e
echo "Running agent-tracing and guardrails-tracing tests..."
node --test tests/agent-tracing.mjs tests/guardrails-tracing.mjs
echo "Tests completed successfully."