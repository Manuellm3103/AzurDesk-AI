import helpdeskService from '../helpdesk/helpdeskService.js';
import { randomId } from './_utils.js';

export const MCP_TOOLS = [
  {
    name: 'create_ticket',
    description: 'Create a support ticket in AzurDesk AI',
    inputSchema: {
      type: 'object',
      properties: {
        requester_email: { type: 'string', description: 'Email of the requester' },
        requester_name: { type: 'string', description: 'Name of the requester' },
        subject: { type: 'string', description: 'Ticket subject' },
        body: { type: 'string', description: 'Ticket description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority' }
      },
      required: ['requester_email', 'subject', 'body']
    }
  },
  {
    name: 'get_helpdesk_metrics',
    description: 'Get helpdesk metrics: total, open, breached SLA',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_workflows',
    description: 'List AI workflows for the tenant',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'run_workflow',
    description: 'Run an AI workflow by ID',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'Workflow ID' },
        inputs: { type: 'object', description: 'Workflow inputs' }
      },
      required: ['workflow_id']
    }
  },
  {
    name: 'generate_text',
    description: 'Generate text using the AAAS router',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text prompt' },
        strategy: { type: 'string', enum: ['balanced', 'cheap', 'fast', 'quality'], description: 'Router strategy' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'run_marketing_campaign',
    description: 'Run a multi-agent marketing campaign',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        goal: { type: 'string', description: 'Campaign goal' },
        audience: { type: 'string', description: 'Target audience' },
        channels: { type: 'array', items: { type: 'string' }, description: 'Channels' },
        agents: { type: 'array', items: { type: 'string' }, description: 'Agents to run' }
      },
      required: ['name', 'goal']
    }
  }
];

export async function handleMCPMessage(raw, deps) {
  const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'azurdesk-ai-mcp', version: '2.0.0' }
      }
    };
  }

  if (msg.method === 'tools/list') {
    return { jsonrpc: '2.0', id: msg.id, result: { tools: MCP_TOOLS } };
  }

  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params;
    let result;

    switch (name) {
      case 'create_ticket': {
        const t = helpdeskService.createTicket({
          tenant_id: deps.tenant_id,
          requester_email: args.requester_email,
          requester_name: args.requester_name || args.requester_email,
          subject: args.subject,
          body: args.body
        });
        result = { success: true, ticket_id: t.ticket.id, priority: t.ticket.priority };
        break;
      }
      case 'get_helpdesk_metrics': {
        result = helpdeskService.getMetrics(deps.tenant_id);
        break;
      }
      case 'list_workflows': {
        result = deps.workflowService.list(deps.tenant_id);
        break;
      }
      case 'run_workflow': {
        result = await deps.workflowService.run(deps.tenant_id, args.workflow_id, args.inputs || {});
        break;
      }
      case 'generate_text': {
        result = await deps.aaasRouter.generate(deps.tenant_id, {
          prompt: args.prompt,
          strategy: args.strategy || 'balanced'
        });
        break;
      }
      case 'run_marketing_campaign': {
        const results = [];
        for (const kind of (args.agents || ['content', 'lead'])) {
          const r = await deps.marketingService.runAgent(deps.tenant_id, kind, {
            brand: args.name,
            topic: args.goal,
            audience: args.audience || '',
            channels: args.channels || []
          });
          results.push({ kind, result: r });
        }
        await deps.marketingService.createCampaign(deps.tenant_id, {
          name: args.name,
          goal: args.goal,
          target_audience: args.audience || '',
          channels: args.channels || [],
          agents: args.agents || []
        });
        result = { success: true, agents_run: results.length, results };
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: false
      }
    };
  }

  throw new Error(`Unknown method: ${msg.method}`);
}
