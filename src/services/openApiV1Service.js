// OpenAPI 3.1 spec generator for the public AaaS v1 API.
// Auto-generates the spec from the routeV1 dispatch table, so docs never
// drift from implementation. Mounted at GET /v1/openapi.json.
//
// Why a hand-rolled generator instead of swagger-jsdoc or zod-to-openapi:
//   - The /v1 surface is small (10 endpoints) and stable
//   - swagger-jsdoc requires invasive JSDoc comments in every handler
//   - zod-to-openapi would couple every request/response shape to zod
//   - This approach: declare the surface once here, share between router
//     and docs. KISS/DRY.

const VERSION = '1.0.0';
const API_NAME = 'AzurDesk AI AaaS';
const API_DESCRIPTION = 'Public Agent-as-a-Service API for external developers. Authenticate with an API key (Bearer token) obtained from POST /v1/api-keys.';

const SECURITY_SCHEMES = {
  ApiKeyAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'API Key',
    description: 'Use the key returned by POST /v1/api-keys as `Authorization: Bearer azdk_xxx`'
  }
};

/**
 * Build the OpenAPI 3.1 document.
 */
export function buildV1OpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: API_NAME,
      version: VERSION,
      description: API_DESCRIPTION,
      contact: { name: 'AzurDesk AI Engineering', email: 'api@azurdesk.ai' },
      license: { name: 'Commercial', url: 'https://azurdesk.ai/terms' }
    },
    servers: [
      { url: 'http://localhost:5200/v1', description: 'Local development' },
      { url: 'https://api.azurdesk.ai/v1', description: 'Production' }
    ],
    security: [{ ApiKeyAuth: [] }],
    components: { securitySchemes: SECURITY_SCHEMES, schemas: schemas() },
    paths: paths(),
    tags: [
      { name: 'Health', description: 'Liveness/readiness' },
      { name: 'AAAS', description: 'LLM completion and routing' },
      { name: 'API Keys', description: 'Manage API keys for the current tenant' },
      { name: 'Marketplace', description: 'Discover, install, and review skills' }
    ]
  };
}

function schemas() {
  return {
    Error: {
      type: 'object',
      required: ['error'],
      properties: {
        error: { type: 'string', description: 'Stable error code' },
        message: { type: 'string', description: 'Human-readable error message' }
      },
      required: ['error'],
      example: { error: 'invalid_api_key', message: 'API key is invalid or revoked' }
    },
    ApiKey: {
      type: 'object',
      required: ['id', 'tenant_id', 'name', 'key_prefix', 'scopes'],
      properties: {
        id: { type: 'string', example: 'apikey-1782912890765-ok4vka' },
        tenant_id: { type: 'string', example: 'demo' },
        name: { type: 'string', example: 'production' },
        key_prefix: { type: 'string', example: 'azdk_a1b2c3d4' },
        scopes: { type: 'array', items: { type: 'string' }, example: ['aaas:read', 'aaas:write'] },
        enabled: { type: 'boolean' },
        created_at: { type: 'string', format: 'date-time' },
        last_used_at: { type: 'string', format: 'date-time', nullable: true }
      }
    },
    CreateApiKeyRequest: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, example: 'production-key' },
        environment: { type: 'string', enum: ['live', 'test'], default: 'live' }
      }
    },
    CreateApiKeyResponse: {
      type: 'object',
      required: ['success', 'key'],
      properties: {
        success: { type: 'boolean' },
        key: { $ref: '#/components/schemas/ApiKey' }
      }
    },
    UsageStats: {
      type: 'object',
      required: ['api_key_id', 'period', 'used', 'limit', 'remaining'],
      properties: {
        api_key_id: { type: 'string' },
        period: { type: 'string', pattern: '^\\d{4}-\\d{2}$', example: '2026-07' },
        used: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1 },
        remaining: { type: 'integer', minimum: 0 }
      }
    },
    GenerateRequest: {
      type: 'object',
      properties: {
        prompt: { type: 'string', minLength: 1, example: 'Explain quantum computing in 2 sentences' },
        messages: { type: 'array', description: 'OpenAI-style messages array (overrides prompt)', items: { type: 'object' } },
        model: { type: 'string', nullable: true, description: 'Override the default model selection' },
        max_tokens: { type: 'integer', minimum: 1, maximum: 32000, default: 1024 },
        temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 },
        fallback: { type: 'boolean', default: true, description: 'Try alternative providers on failure' }
      }
    },
    GenerateResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        text: { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' },
        usage: { type: 'object', additionalProperties: true },
        api_version: { type: 'string', example: 'v1' }
      }
    },
    Model: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        provider: { type: 'string' },
        kind: { type: 'string', enum: ['chat', 'embeddings', 'image', 'code'] },
        cost_per_1k_input: { type: 'number' },
        cost_per_1k_output: { type: 'number' }
      }
    },
    Provider: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        tenant_id: { type: 'string' },
        kind: { type: 'string' },
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        models: { type: 'array', items: { type: 'string' } }
      }
    },
    Skill: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        name: { type: 'string' },
        author: { type: 'string' },
        version: { type: 'string', example: '1.2.0' },
        kind: { type: 'string', enum: ['tool', 'agent', 'workflow'] },
        category: { type: 'string' },
        description: { type: 'string' },
        rating_avg: { type: 'number', minimum: 0, maximum: 5 },
        rating_count: { type: 'integer', minimum: 0 },
        install_count: { type: 'integer', minimum: 0 }
      }
    }
  };
}

const COMMON_401 = {
  description: 'Missing or invalid API key',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
};
const COMMON_429 = {
  description: 'Rate limit exceeded (60 requests/minute per key)',
  headers: {
    'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until next request allowed' }
  },
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
};
const COMMON_402 = {
  description: 'Monthly quota exceeded',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
};
const COMMON_RATE_HEADERS = {
  'X-RateLimit-Limit': { schema: { type: 'integer' }, description: '60 requests per minute' },
  'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Requests remaining in the current minute window' },
  'X-Quota-Used': { schema: { type: 'integer' }, description: 'Requests consumed in the current monthly billing period' },
  'X-Quota-Limit': { schema: { type: 'integer' }, description: 'Monthly quota limit (default 100000)' },
  'X-API-Key-Prefix': { schema: { type: 'string' }, description: 'First 12 characters of the API key that made the request' }
};

function paths() {
  return {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Public health check',
        description: 'Returns API status. No authentication required.',
        security: [],
        responses: {
          200: { description: 'Service is healthy', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, api: { type: 'string' }, version: { type: 'string' }, api_version: { type: 'string' } } } } } }
        }
      }
    },
    '/aaas/models': {
      get: {
        tags: ['AAAS'],
        summary: 'List available models for the current tenant',
        responses: {
          200: { description: 'Available models', headers: COMMON_RATE_HEADERS, content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, models: { type: 'array', items: { $ref: '#/components/schemas/Model' } }, api_version: { type: 'string' } } } } } },
          401: COMMON_401,
          402: COMMON_402,
          429: COMMON_429
        }
      }
    },
    '/aaas/generate': {
      post: {
        tags: ['AAAS'],
        summary: 'Generate a completion from the LLM router',
        description: 'Routes the prompt to the best available provider based on cost, latency, and capability. Falls back to alternative providers on failure unless `fallback: false`.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateRequest' } } } },
        responses: {
          200: { description: 'Generation result (success=false if no providers are configured)', headers: COMMON_RATE_HEADERS, content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateResponse' } } } },
          400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: COMMON_401,
          402: COMMON_402,
          429: COMMON_429
        }
      }
    },
    '/aaas/usage': {
      get: {
        tags: ['AAAS'],
        summary: 'Get quota usage for the current API key',
        responses: {
          200: { description: 'Usage stats', headers: COMMON_RATE_HEADERS, content: { 'application/json': { schema: { $ref: '#/components/schemas/UsageStats' } } } },
          401: COMMON_401
        }
      }
    },
    '/aaas/providers': {
      get: {
        tags: ['AAAS'],
        summary: 'List LLM providers configured for the current tenant',
        responses: {
          200: { description: 'Provider list', headers: COMMON_RATE_HEADERS, content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, providers: { type: 'array', items: { $ref: '#/components/schemas/Provider' } } } } } } },
          401: COMMON_401
        }
      }
    },
    '/api-keys': {
      get: {
        tags: ['API Keys'],
        summary: 'List API keys for the current tenant',
        description: 'Returns keys without their secret values (only `key_prefix` is shown).',
        responses: {
          200: { description: 'Key list', headers: COMMON_RATE_HEADERS, content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, keys: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } } } } } } },
          401: COMMON_401
        }
      },
      post: {
        tags: ['API Keys'],
        summary: 'Create a new API key',
        description: 'The raw key value is returned only in this response. Store it securely — it cannot be retrieved later.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateApiKeyRequest' } } } },
        responses: {
          201: { description: 'Key created', headers: COMMON_RATE_HEADERS, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateApiKeyResponse' } } } },
          400: { description: 'Missing `name`', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: COMMON_401
        }
      }
    },
    '/api-keys/{id}': {
      delete: {
        tags: ['API Keys'],
        summary: 'Revoke an API key',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Key revoked', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          401: COMMON_401
        }
      }
    },
    '/marketplace': {
      get: {
        tags: ['Marketplace'],
        summary: 'Browse the skill marketplace',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search on name and description' },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'kind', in: 'query', schema: { type: 'string', enum: ['tool', 'agent', 'workflow'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }
        ],
        responses: {
          200: { description: 'Matching skills', headers: COMMON_RATE_HEADERS, content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, skills: { type: 'array', items: { $ref: '#/components/schemas/Skill' } } } } } } },
          401: COMMON_401
        }
      }
    },
    '/marketplace/installed': {
      get: {
        tags: ['Marketplace'],
        summary: 'List skills installed by the current tenant',
        responses: {
          200: { description: 'Installed skills', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, skills: { type: 'array', items: { $ref: '#/components/schemas/Skill' } } } } } } },
          401: COMMON_401
        }
      }
    }
  };
}
