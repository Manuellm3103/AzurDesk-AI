# @azurdesk/sdk

TypeScript SDK for the AzurDesk AI AaaS v1 API. Zero dependencies, Node 18+, full ESM.

## Install

```bash
npm install @azurdesk/sdk
```

## Quickstart

```typescript
import { AzurDeskClient } from '@azurdesk/sdk';

const client = new AzurDeskClient({
  apiKey: process.env.AZURDESK_API_KEY!,
  baseUrl: 'https://api.azurdesk.ai/v1'
});

// Discover models
const models = await client.listModels();
console.log(`${models.length} models available`);

// Generate
const result = await client.generate('Explain quantum computing in 2 sentences', {
  maxTokens: 256,
  temperature: 0.7
});
console.log(result.text);
console.log(`  via ${result.provider}/${result.model} in ${result.latency_ms}ms`);

// Quota
const usage = await client.usage();
console.log(`Quota: ${usage.used}/${usage.limit}`);
```

## Features

- ✅ TypeScript types for all responses
- ✅ Zero dependencies (uses native `fetch`)
- ✅ Automatic retry on 429/5xx with exponential backoff
- ✅ Custom error classes (`AzurDeskAuthError`, `AzurDeskRateLimitError`, `AzurDeskQuotaError`)
- ✅ Streaming-ready (single-method calls)
- ✅ Full v1 API: models, generate, usage, providers, api-keys, marketplace, billing

## API reference

See `/docs/API.md` in the AzurDesk AI repo.
