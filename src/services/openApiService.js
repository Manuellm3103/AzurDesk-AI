import db from './db.js';
import { now, safeJson } from './_utils.js';

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'AzurDesk AI API',
    version: '1.0.0',
    description: 'AI-as-a-Service helpdesk with multi-provider LLM routing, marketing AI agents, and production hardening.',
    license: { name: 'MIT' }
  },
  servers: [
    { url: '/api', description: 'Relative to server' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
    }
  },
  paths: {}
};

const PATHS = [
  { path: '/health', method: 'get', summary: 'Health check', tags: ['system'], responses: { '200': { description: 'Operational' } } },
  { path: '/auth/login', method: 'post', summary: 'Authenticate user', tags: ['auth'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { '200': { description: 'JWT token' }, '401': { description: 'Invalid credentials' } } },
  { path: '/tickets', method: 'post', summary: 'Create ticket', tags: ['helpdesk'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Ticket created' } } },
  { path: '/tickets', method: 'get', summary: 'List tickets', tags: ['helpdesk'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Ticket list' } } },
  { path: '/sites', method: 'post', summary: 'Create website', tags: ['builder'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Site created' } } },
  { path: '/sites', method: 'get', summary: 'List websites', tags: ['builder'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Site list' } } },
  { path: '/agents', method: 'post', summary: 'Register agent', tags: ['agents'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Agent registered' } } },
  { path: '/agents', method: 'get', summary: 'List agents', tags: ['agents'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Agent list' } } },
  { path: '/ai/reply', method: 'post', summary: 'Generate AI reply', tags: ['ai'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Generated reply' } } },
  { path: '/ai/rag', method: 'post', summary: 'RAG search + LLM', tags: ['ai'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'RAG results' } } },
  { path: '/llm/generate', method: 'post', summary: 'Legacy LLM generate', tags: ['llm'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Generated text' } } },
  { path: '/aaas/providers', method: 'post', summary: 'Add LLM provider', tags: ['aaas'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Provider added' } } },
  { path: '/aaas/providers', method: 'get', summary: 'List LLM providers', tags: ['aaas'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Provider list' } } },
  { path: '/aaas/models', method: 'get', summary: 'List available models', tags: ['aaas'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Model list' } } },
  { path: '/aaas/generate', method: 'post', summary: 'Generate via AAAS router', tags: ['aaas'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Generated text' } } },
  { path: '/aaas/usage', method: 'get', summary: 'AAAS usage stats', tags: ['aaas'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Usage stats' } } },
  { path: '/marketing/campaigns', method: 'post', summary: 'Create marketing campaign', tags: ['marketing'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Campaign created' } } },
  { path: '/marketing/campaigns', method: 'get', summary: 'List marketing campaigns', tags: ['marketing'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Campaign list' } } },
  { path: '/marketing/assets', method: 'get', summary: 'List marketing assets', tags: ['marketing'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Asset list' } } },
  { path: '/automaton/rules', method: 'post', summary: 'Create automaton rule', tags: ['automaton'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Rule created' } } },
  { path: '/automaton/rules', method: 'get', summary: 'List automaton rules', tags: ['automaton'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Rule list' } } },
  { path: '/mesh/nodes', method: 'post', summary: 'Add mesh node', tags: ['mesh'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Node added' } } },
  { path: '/mesh/nodes', method: 'get', summary: 'List mesh nodes', tags: ['mesh'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Node list' } } },
  { path: '/legal/cases', method: 'post', summary: 'Create legal case', tags: ['legal'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Case created' } } },
  { path: '/legal/cases', method: 'get', summary: 'List legal cases', tags: ['legal'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Case list' } } },
  { path: '/legal/contracts/reviews', method: 'post', summary: 'Review contract', tags: ['legal'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Contract review' } } },
  { path: '/radar', method: 'get', summary: 'Predictive incident radar', tags: ['radar'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Radar data' } } },
  { path: '/api-keys', method: 'post', summary: 'Create API key', tags: ['api-keys'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'API key created' } } },
  { path: '/api-keys', method: 'get', summary: 'List API keys', tags: ['api-keys'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'API key list' } } },
  { path: '/audit/logs', method: 'get', summary: 'List audit logs', tags: ['audit'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Audit log list' } } },
  { path: '/quota', method: 'get', summary: 'Get tenant quota', tags: ['quota'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Quota info' } } },
  { path: '/quota', method: 'put', summary: 'Update tenant quota', tags: ['quota'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Quota updated' } } }
];

export function buildSpec() {
  const spec = JSON.parse(JSON.stringify(SPEC));
  for (const p of PATHS) {
    const fullPath = p.path.startsWith('/') ? p.path : `/${p.path}`;
    if (!spec.paths[fullPath]) spec.paths[fullPath] = {};
    spec.paths[fullPath][p.method] = {
      summary: p.summary,
      tags: p.tags,
      security: p.security || [],
      responses: p.responses || {},
      ...(p.requestBody ? { requestBody: p.requestBody } : {})
    };
  }
  return spec;
}

export default { buildSpec };