/**
 * MCP 1.0 Streamable-HTTP Transport (spec 2025-11-25).
 *
 * Implements the official Model Context Protocol transport layer:
 * - Single endpoint POST /mcp (and GET for SSE streams)
 * - JSON-RPC 2.0 over HTTP
 * - Server-Sent Events (SSE) streaming for long responses
 * - Session management via Mcp-Session-Id header
 * - initialize/initialized/capabilities handshake
 * - tools/list, tools/call, resources/list, resources/read, prompts/list
 *
 * Compatible with: Claude Desktop 1.0+, Cursor, Cline, Continue.dev, Zed.
 */

import { randomUUID, createHash } from 'crypto';
import { MCP_TOOLS, handleMCPMessage as handleExpandedMessage } from './mcpExpandedService.js';

const MCP_VERSION = '2025-11-25';
const SERVER_NAME = 'azurdesk-ai';
const SERVER_VERSION = '2.6.11';

// In-memory session store (per-process; for multi-instance use Redis)
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

function createSession(tenant_id, clientInfo) {
  const id = randomUUID();
  const session = {
    id,
    tenant_id,
    clientInfo: clientInfo || {},
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    initialized: false
  };
  sessions.set(id, session);
  // Garbage collect expired
  for (const [k, v] of sessions.entries()) {
    if (Date.now() - new Date(v.last_seen).getTime() > SESSION_TTL_MS) sessions.delete(k);
  }
  return session;
}

function touchSession(id) {
  const s = sessions.get(id);
  if (s) s.last_seen = new Date().toISOString();
  return s;
}

function deleteSession(id) {
  return sessions.delete(id);
}

function getSession(id) {
  return sessions.get(id);
}

// JSON-RPC 2.0 helpers
function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function jsonRpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}
const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL_ERROR = -32603;

// Build MCP capabilities (what the server can do)
function buildCapabilities() {
  return {
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
    prompts: { listChanged: false },
    logging: {}
  };
}

// Build server info
function buildServerInfo() {
  return { name: SERVER_NAME, version: SERVER_VERSION };
}

// Convert internal tool definitions to MCP-compliant format
function buildMCPToolsList() {
  return MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}

// Expose AzurDesk resources (knowledge base, tickets, agents) for resources/read
function buildMCPResourcesList(tenant_id) {
  // Lazy: we don't preload; we list dynamically via service calls
  return [
    {
      uri: `azurdesk://${tenant_id}/helpdesk/metrics`,
      name: 'Helpdesk Metrics',
      description: 'Real-time helpdesk KPIs: total, open, breached SLA',
      mimeType: 'application/json'
    },
    {
      uri: `azurdesk://${tenant_id}/agents`,
      name: 'Agent Roster',
      description: 'List of agents available in the tenant',
      mimeType: 'application/json'
    },
    {
      uri: `azurdesk://${tenant_id}/billing/summary`,
      name: 'Billing Summary',
      description: 'Current period cost + 6-month history',
      mimeType: 'application/json'
    }
  ];
}

function buildMCPPromptsList() {
  return [
    {
      name: 'create_ticket_prompt',
      description: 'Guided prompt for creating a support ticket',
      arguments: [
        { name: 'issue', description: 'Brief description of the issue', required: true },
        { name: 'priority', description: 'low|medium|high|critical', required: false }
      ]
    },
    {
      name: 'rag_query_prompt',
      description: 'Guided RAG query against the knowledge base',
      arguments: [
        { name: 'query', description: 'Search query', required: true }
      ]
    }
  ];
}

// Handle a JSON-RPC 2.0 request
async function handleJsonRpc(body, ctx = {}) {
  const { tenant_id = 'demo' } = ctx;
  if (!body || typeof body !== 'object') {
    return jsonRpcError(null, RPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
  }
  const { jsonrpc, id, method, params = {} } = body;
  if (jsonrpc !== '2.0') {
    return jsonRpcError(id || null, RPC_INVALID_REQUEST, 'jsonrpc field must be "2.0"');
  }
  if (!method || typeof method !== 'string') {
    return jsonRpcError(id, RPC_INVALID_REQUEST, 'method is required');
  }

  try {
    switch (method) {
      case 'initialize': {
        // Client handshake — return server info + capabilities
        const session = createSession(tenant_id, params.clientInfo);
        return jsonRpcResult(id, {
          protocolVersion: MCP_VERSION,
          capabilities: buildCapabilities(),
          serverInfo: buildServerInfo(),
          sessionId: session.id
        });
      }
      case 'ping': {
        return jsonRpcResult(id, { pong: true, ts: new Date().toISOString() });
      }
      case 'tools/list': {
        return jsonRpcResult(id, { tools: buildMCPToolsList() });
      }
      case 'tools/call': {
        const { name, arguments: args = {} } = params;
        if (!name) return jsonRpcError(id, RPC_INVALID_PARAMS, 'tools/call requires name');
        // Delegate to existing mcpExpandedService handler
        const result = await handleExpandedMessage(
          { method: 'tools/call', params: { name, arguments: args } },
          ctx
        );
        // Normalize to MCP content format
        if (result && result.error) {
          return jsonRpcResult(id, {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            isError: true
          });
        }
        return jsonRpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result?.result ?? result) }],
          isError: false
        });
      }
      case 'resources/list': {
        return jsonRpcResult(id, { resources: buildMCPResourcesList(tenant_id) });
      }
      case 'resources/read': {
        const { uri } = params;
        if (!uri) return jsonRpcError(id, RPC_INVALID_PARAMS, 'resources/read requires uri');
        const contents = await readMCPResource(uri, ctx);
        return jsonRpcResult(id, { contents });
      }
      case 'prompts/list': {
        return jsonRpcResult(id, { prompts: buildMCPPromptsList() });
      }
      case 'prompts/get': {
        const { name, arguments: args = {} } = params;
        const prompt = renderMCPPrompt(name, args);
        if (!prompt) return jsonRpcError(id, RPC_METHOD_NOT_FOUND, `Unknown prompt: ${name}`);
        return jsonRpcResult(id, prompt);
      }
      case 'notifications/initialized': {
        // Client confirmed init; mark session
        return jsonRpcResult(id, { acknowledged: true });
      }
      default:
        return jsonRpcError(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (e) {
    return jsonRpcError(id, RPC_INTERNAL_ERROR, e.message || 'Internal error', { stack: e.stack });
  }
}

async function readMCPResource(uri, ctx) {
  // Lazily import to avoid circular deps
  const helpdeskService = (await import('../helpdesk/helpdeskService.js')).default;
  const billingService = (await import('./billingService.js')).default;
  const { tenant_id = 'demo' } = ctx;
  const u = String(uri || '');
  if (u.endsWith('/helpdesk/metrics')) {
    return [{ uri, mimeType: 'application/json', text: JSON.stringify(helpdeskService.metrics({ tenant_id })) }];
  }
  if (u.endsWith('/agents')) {
    const svc = (await import('./agentRuntimeService.js')).default;
    return [{ uri, mimeType: 'application/json', text: JSON.stringify(svc.listAgents(tenant_id)) }];
  }
  if (u.endsWith('/billing/summary')) {
    return [{ uri, mimeType: 'application/json', text: JSON.stringify(billingService.getSummary(tenant_id)) }];
  }
  return [{ uri, mimeType: 'text/plain', text: `Unknown resource URI: ${uri}` }];
}

function renderMCPPrompt(name, args) {
  if (name === 'create_ticket_prompt') {
    const issue = args.issue || '(describe el problema)';
    const priority = args.priority || 'medium';
    return {
      description: 'Create a support ticket from a user description',
      messages: [
        { role: 'user', content: { type: 'text', text:
          `Crea un ticket de soporte con prioridad ${priority}.\n\nDescripción del problema:\n${issue}\n\n` +
          `Responde con un JSON que llame a la tool create_ticket con los campos:\n` +
          `requester_email, requester_name, subject (resumen corto), body (descripción completa).`
        } }
      ]
    };
  }
  if (name === 'rag_query_prompt') {
    const query = args.query || '';
    return {
      description: 'Search the knowledge base with a query',
      messages: [
        { role: 'user', content: { type: 'text', text:
          `Busca en la base de conocimiento: "${query}".\n\n` +
          `Usa la tool hybrid_search con user_id del contexto y limit=5. ` +
          `Devuelve los 3 resultados más relevantes con snippet y source.`
        } }
      ]
    };
  }
  return null;
}

// Server-Sent Events encoding for streaming responses (notifications/requests from server)
function sseFrame(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export {
  MCP_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  handleJsonRpc,
  buildMCPToolsList,
  buildMCPResourcesList,
  buildMCPPromptsList,
  buildCapabilities,
  buildServerInfo,
  createSession,
  getSession,
  touchSession,
  deleteSession,
  sseFrame,
  readMCPResource,
  renderMCPPrompt
};
