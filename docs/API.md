# AzurDesk AI AaaS — Public API v1

The AaaS (Agent-as-a-Service) API lets external developers run LLM-powered
agents and discover marketplace skills without writing against the in-app
AAAS router. Authenticate with an API key, get billed by request, and ship
faster.

**Base URL**: `https://api.azurdesk.ai/v1` (production) · `http://localhost:5200/v1` (local)
**Auth**: `Authorization: Bearer azdk_xxx`
**Rate limit**: 60 requests/minute per key
**Quota**: 100,000 requests/month per key (Free tier)

---

## 1. Get an API key

First, log in to the AzurDesk dashboard and create a key. From a JWT session
in the in-app UI:

```bash
curl -X POST http://localhost:5200/api/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"name":"my-app","scopes":["aaas:read","aaas:write"]}'
```

Response:
```json
{
  "id": "apikey-1782912890765-ok4vka",
  "name": "my-app",
  "key": "azdk_a1b2c3d4...",
  "key_prefix": "azdk_a1b2c3d4",
  "scopes": ["aaas:read", "aaas:write"]
}
```

> **Store the `key` value now** — it is shown only once. Subsequent `GET /v1/api-keys` returns
> keys without the secret, only `key_prefix`.

---

## 2. Quickstart — `curl`

```bash
export AZURDESK_KEY="azdk_a1b2c3d4..."

# Health check (no auth required)
curl https://api.azurdesk.ai/v1/health

# List available models
curl -H "Authorization: Bearer $AZURDESK_KEY" \
  https://api.azurdesk.ai/v1/aaas/models

# Generate a completion
curl -X POST https://api.azurdesk.ai/v1/aaas/generate \
  -H "Authorization: Bearer $AZURDESK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Explain quantum computing in 2 sentences","max_tokens":256}'

# Check quota usage
curl -H "Authorization: Bearer $AZURDESK_KEY" \
  https://api.azurdesk.ai/v1/aaas/usage
```

---

## 3. Quickstart — Python SDK

```bash
pip install azurdesk
```

```python
import asyncio
from azurdesk import AzurDeskClient

async def main():
    async with AzurDeskClient(api_key="azdk_a1b2c3d4...") as client:
        # Discover available models
        models = await client.list_models()
        print(f"{len(models)} models available")

        # Generate a completion
        result = await client.generate(
            "Explain quantum computing in 2 sentences",
            max_tokens=256,
            temperature=0.7,
        )
        print(result.text)
        print(f"  via {result.provider}/{result.model}")

        # Check quota
        usage = await client.usage()
        print(f"Quota: {usage.used}/{usage.limit} this month")

asyncio.run(main())
```

Source: `azurdesk-ai-py/azurdesk/__init__.py` — 16 tests passing.

---

## 4. Quickstart — JavaScript / TypeScript

```bash
npm install @azurdesk/sdk  # coming soon
```

For now, use raw `fetch`:

```javascript
const AZURDESK_KEY = "azdk_a1b2c3d4...";

const response = await fetch("https://api.azurdesk.ai/v1/aaas/generate", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${AZURDESK_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: "Explain quantum computing in 2 sentences",
    max_tokens: 256,
  }),
});

const data = await response.json();
console.log(data.text);
```

---

## 5. Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/v1/health` | Liveness (no auth) |
| GET | `/v1/aaas/models` | List available models for the tenant |
| POST | `/v1/aaas/generate` | Generate an LLM completion |
| GET | `/v1/aaas/usage` | Quota usage for the current key |
| GET | `/v1/aaas/providers` | LLM providers configured for the tenant |
| GET | `/v1/api-keys` | List API keys for the tenant |
| POST | `/v1/api-keys` | Create a new API key |
| DELETE | `/v1/api-keys/{id}` | Revoke an API key |
| GET | `/v1/marketplace` | Browse the skill marketplace |
| GET | `/v1/marketplace/installed` | List installed skills |
| GET | `/v1/openapi.json` | OpenAPI 3.1 spec for the public API |

The full OpenAPI 3.1 spec is served at `/v1/openapi.json` — pipe it through
`openapi-generator-cli` to produce clients in any language.

---

## 6. Error codes

| HTTP | Code | Meaning | Action |
|---|---|---|---|
| 401 | `missing_api_key` | No Bearer token | Set `Authorization: Bearer ...` |
| 401 | `invalid_api_key` | Key is wrong or revoked | Create a new key with `POST /v1/api-keys` |
| 402 | `quota_exceeded` | Monthly quota consumed | Upgrade plan or wait for next month |
| 429 | `rate_limited` | 60 req/min exceeded | Wait `Retry-After` seconds, then retry |
| 500 | `internal_error` | Server-side failure | Retry with exponential backoff (SDK does this automatically) |

All errors return:
```json
{ "error": "invalid_api_key", "message": "API key is invalid or revoked" }
```

---

## 7. Response headers

Every `/v1/*` response includes:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Requests allowed per minute (60) |
| `X-RateLimit-Remaining` | Requests left in the current minute window |
| `X-Quota-Used` | Requests consumed this billing period |
| `X-Quota-Limit` | Monthly quota (100,000 for Free) |
| `X-API-Key-Prefix` | First 12 characters of the key that made the request |

Use these to build client-side rate limiters and quota dashboards.

---

## 8. Pricing

| Plan | Price | Quota | Rate limit | Support |
|---|---|---|---|---|
| **Free** | $0/mo | 100,000 req | 60 req/min | Community |
| **Pro** | $99/mo | 1,000,000 req | 600 req/min | Email, 24h |
| **Enterprise** | Custom | Unlimited | Custom | SLA, dedicated CSM |

Every Pro plan includes 1.5× margin on inference cost vs raw OpenAI. Charge
your customers per-request and pay only what you use.

---

## 9. What's next

- **Stripe billing** (Sprint 4) — self-service plan upgrades, metered usage
- **OpenAPI Generator** — `openapi-generator-cli generate -i /v1/openapi.json -g go -o ./sdk`
- **Status page** — `status.azurdesk.ai` (Better Stack)
- **SOC 2 Type II** — Q3 2026 audit via Drata

For enterprise plans, contact api@azurdesk.ai.
