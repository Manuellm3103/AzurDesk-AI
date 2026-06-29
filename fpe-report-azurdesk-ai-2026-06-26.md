# FPE Report — AzurDesk AI

- **Date**: 2026-06-26
- **Service**: http://127.0.0.1:5200
- **Version**: 1.0.0
- **Health**: operational (`/api/health` 200 in ~50ms)

## Findings

| Category | Endpoint | Detail | Severity | Recommendation |
|---|---|---|---|---|
| AUTH | GET /api/voice/status | Returns 401 because probe has no token | Expected | Not a bug; endpoint requires auth. Add token to probe if needed. |
| AUTH | POST /api/visual/logo | Returns 401 because probe has no token | Expected | Not a bug; endpoint requires auth. |
| AUTH | POST /api/visual/image | Returns 401 because probe has no token | Expected | Not a bug; endpoint requires auth. |
| AUTH | POST /api/voice/tts | Returns 401 because probe has no token | Expected | Not a bug; endpoint requires auth. |

## Smoke Test (AzurDesk internal)

- `node tests/smoke.mjs` → 33/33 passed
- `npm run build` → 50/51 pass, 1 skip (obsidian)

## Conclusion

No critical or silent failures detected in the core AzurDesk API. The 401s are auth-guarded endpoints that require a valid Bearer token. The FPE probe script does not send authentication, which is expected behavior for public probes.

Next action: verify these endpoints with a valid token before claiming full coverage; core business endpoints are healthy.
