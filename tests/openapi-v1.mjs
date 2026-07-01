import test from 'node:test';
import assert from 'node:assert/strict';
import { buildV1OpenApiSpec } from '../src/services/openApiV1Service.js';

test('buildV1OpenApiSpec: returns OpenAPI 3.1 root document', () => {
  const spec = buildV1OpenApiSpec();
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.title, 'AzurDesk AI AaaS');
  assert.equal(spec.info.version, '1.0.0');
  assert.ok(spec.info.description);
});

test('buildV1OpenApiSpec: declares both local and production servers', () => {
  const spec = buildV1OpenApiSpec();
  const urls = spec.servers.map((s) => s.url);
  assert.ok(urls.includes('http://localhost:5200/v1'));
  assert.ok(urls.includes('https://api.azurdesk.ai/v1'));
});

test('buildV1OpenApiSpec: includes all 10 v1 endpoints', () => {
  const spec = buildV1OpenApiSpec();
  const paths = Object.keys(spec.paths);
  assert.ok(paths.includes('/health'));
  assert.ok(paths.includes('/aaas/models'));
  assert.ok(paths.includes('/aaas/generate'));
  assert.ok(paths.includes('/aaas/usage'));
  assert.ok(paths.includes('/aaas/providers'));
  assert.ok(paths.includes('/api-keys'));
  assert.ok(paths.includes('/api-keys/{id}'));
  assert.ok(paths.includes('/marketplace'));
  assert.ok(paths.includes('/marketplace/installed'));
  assert.equal(paths.length, 9, 'expected exactly 9 path entries');
});

test('buildV1OpenApiSpec: /aaas/generate has POST with request and response', () => {
  const spec = buildV1OpenApiSpec();
  const op = spec.paths['/aaas/generate'].post;
  assert.equal(op.summary, 'Generate a completion from the LLM router');
  assert.ok(op.requestBody);
  assert.ok(op.requestBody.content['application/json'].schema.$ref);
  assert.ok(op.responses[200]);
  assert.ok(op.responses[401]);
  assert.ok(op.responses[402]);
  assert.ok(op.responses[429]);
});

test('buildV1OpenApiSpec: rate limit headers documented on 200 responses', () => {
  const spec = buildV1OpenApiSpec();
  const h = spec.paths['/aaas/models'].get.responses[200].headers;
  assert.ok(h['X-RateLimit-Limit']);
  assert.ok(h['X-RateLimit-Remaining']);
  assert.ok(h['X-Quota-Used']);
  assert.ok(h['X-Quota-Limit']);
  assert.ok(h['X-API-Key-Prefix']);
});

test('buildV1OpenApiSpec: /health is public (no security required)', () => {
  const spec = buildV1OpenApiSpec();
  assert.deepEqual(spec.paths['/health'].get.security, []);
});

test('buildV1OpenApiSpec: declares ApiKeyAuth as the only security scheme', () => {
  const spec = buildV1OpenApiSpec();
  assert.ok(spec.components.securitySchemes.ApiKeyAuth);
  assert.equal(spec.components.securitySchemes.ApiKeyAuth.type, 'http');
  assert.equal(spec.components.securitySchemes.ApiKeyAuth.scheme, 'bearer');
  assert.equal(spec.components.securitySchemes.ApiKeyAuth.bearerFormat, 'API Key');
  assert.deepEqual(spec.security, [{ ApiKeyAuth: [] }]);
});

test('buildV1OpenApiSpec: schemas include all referenced types', () => {
  const spec = buildV1OpenApiSpec();
  const s = spec.components.schemas;
  assert.ok(s.Error);
  assert.ok(s.ApiKey);
  assert.ok(s.CreateApiKeyRequest);
  assert.ok(s.CreateApiKeyResponse);
  assert.ok(s.UsageStats);
  assert.ok(s.GenerateRequest);
  assert.ok(s.GenerateResponse);
  assert.ok(s.Model);
  assert.ok(s.Provider);
  assert.ok(s.Skill);
});

test('buildV1OpenApiSpec: tags are well-defined and unique', () => {
  const spec = buildV1OpenApiSpec();
  const names = spec.tags.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('Health'));
  assert.ok(names.includes('AAAS'));
  assert.ok(names.includes('API Keys'));
  assert.ok(names.includes('Marketplace'));
});

test('buildV1OpenApiSpec: every path operation has at least one response', () => {
  const spec = buildV1OpenApiSpec();
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      assert.ok(op.responses && Object.keys(op.responses).length > 0, `${method.toUpperCase()} ${p} has no responses`);
    }
  }
});

test('buildV1OpenApiSpec: serializes to valid JSON', () => {
  const spec = buildV1OpenApiSpec();
  const json = JSON.stringify(spec);
  const parsed = JSON.parse(json);
  assert.equal(parsed.openapi, '3.1.0');
});
