// Expanded MCP service exposing AzurDesk AI as a standards-aware MCP server over HTTP.
import { randomUUID } from 'crypto';
import helpdeskService from '../helpdesk/helpdeskService.js';
import workflowService from './workflowService.js';
import aaasRouter from './aaasRouterService.js';
import engramService from './engramService.js';
import { hybridSearch } from './hybridRAGService.js';
import durableWorkflowService from './durableWorkflowService.js';
import a2aService from './a2aService.js';
import localLLMRouter from './localLLMRouterService.js';

const A2A_SECRET = process.env.A2A_SECRET || 'a2a-local-secret';

const MCP_TOOLS = [
  { name: 'create_ticket', description: 'Create a helpdesk ticket', inputSchema: { type: 'object', properties: { requester_email: { type: 'string' }, requester_name: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['requester_email','requester_name','subject','body'] } },
  { name: 'list_tickets', description: 'List helpdesk tickets', inputSchema: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'run_workflow', description: 'Run an AzurDesk workflow by id', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, inputs: { type: 'object' } }, required: ['workflow_id'] } },
  { name: 'remember', description: 'Store a memory in Engram', inputSchema: { type: 'object', properties: { user_id: { type: 'string' }, content: { type: 'string' }, type: { type: 'string' } }, required: ['user_id','content'] } },
  { name: 'recall', description: 'Recall memories from Engram', inputSchema: { type: 'object', properties: { user_id: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number' } }, required: ['user_id','query'] } },
  { name: 'hybrid_search', description: 'Hybrid RAG search across knowledge sources', inputSchema: { type: 'object', properties: { query: { type: 'string' }, user_id: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
  { name: 'create_durable_workflow', description: 'Create a durable workflow', inputSchema: { type: 'object', properties: { name: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, max_retries: { type: 'number' }, compensation: { type: 'array', items: { type: 'string' } } }, required: ['name','steps'] } },
  { name: 'send_a2a_card', description: 'Send an A2A task card to another tenant/agent', inputSchema: { type: 'object', properties: { from_agent: { type: 'string' }, to_tenant: { type: 'string' }, to_agent: { type: 'string' }, task_type: { type: 'string' }, payload: { type: 'object' } }, required: ['from_agent','to_tenant','to_agent','task_type'] } },
  { name: 'route_local_llm', description: 'Route a prompt to a local LLM model', inputSchema: { type: 'object', properties: { text: { type: 'string' }, images: { type: 'array', items: { type: 'string' } } }, required: ['text'] } },
  { name: 'self_heal', description: 'Detect recent errors and propose healing actions', inputSchema: { type: 'object', properties: {} } }
];

async function handleMCPMessage(body, ctx) {
  const { method, id, params = {} } = body || {};
  const tenant_id = ctx.tenant_id || 'demo';

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    let result = {};
    try {
      switch (name) {
        case 'create_ticket':
          result = helpdeskService.createTicket(tenant_id, args);
          break;
        case 'list_tickets':
          result = { tickets: helpdeskService.listTickets(tenant_id, args) };
          break;
        case 'run_workflow':
          result = await workflowService.run(ctx.workflowService, args.workflow_id, args.inputs || {}, tenant_id);
          break;
        case 'remember':
          result = engramService.remember({ tenant_id, user_id: args.user_id, content: args.content, kind: args.type || 'semantic' });
          break;
        case 'recall':
          result = { memories: engramService.recall({ tenant_id, user_id: args.user_id, query: args.query, limit: args.limit || 5 }) };
          break;
        case 'hybrid_search':
          result = { results: hybridSearch({ tenant_id, query: args.query, user_id: args.user_id, topK: args.limit || 5 }) };
          break;
        case 'create_durable_workflow':
          result = durableWorkflowService.create(tenant_id, { name: args.name, steps: args.steps, max_retries: args.max_retries, compensation: args.compensation });
          break;
        case 'send_a2a_card':
          result = a2aService.sendCard(tenant_id, { ...args, secret: A2A_SECRET });
          break;
        case 'route_local_llm':
          result = await localLLMRouter.generate(tenant_id, { text: args.text, images: args.images });
          break;
        case 'self_heal':
          result = { actions: ctx.selfHealing?.detectAndHeal(tenant_id) || [] };
          break;
        default:
          return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Tool not found' } };
      }
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } catch (e) {
      return { jsonrpc: '2.0', id, error: { code: -32603, message: e.message } };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } };
}

export { handleMCPMessage, MCP_TOOLS };
