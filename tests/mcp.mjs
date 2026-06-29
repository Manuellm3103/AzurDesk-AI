import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import { handleMCPMessage, MCP_TOOLS } from '../src/services/mcpService.js';
import aaasRouter from '../src/services/aaasRouterService.js';
import marketingAI from '../src/services/marketingAIService.js';
import workflowService from '../src/services/workflowService.js';
import { randomId } from '../src/services/_utils.js';

const tenant = 'mcp-' + randomId().slice(0, 8);

test('MCP list tools', async () => {
  const r = await handleMCPMessage({ method: 'tools/list', id: 1 }, { tenant_id: tenant, workflowService, aaasRouter, marketingService: marketingAI });
  assert.equal(r.jsonrpc, '2.0');
  assert.equal(r.id, 1);
  assert.ok(r.result.tools.length >= 6);
  assert.ok(r.result.tools.some(t => t.name === 'create_ticket'));
});

test('MCP initialize', async () => {
  const r = await handleMCPMessage({ method: 'initialize', id: 2, params: { protocolVersion: '2024-11-05' } }, { tenant_id: tenant, workflowService, aaasRouter, marketingService: marketingAI });
  assert.equal(r.id, 2);
  assert.equal(r.result.serverInfo.name, 'azurdesk-ai-mcp');
});

test('MCP create ticket', async () => {
  const r = await handleMCPMessage({
    method: 'tools/call',
    id: 3,
    params: {
      name: 'create_ticket',
      arguments: {
        requester_email: 'mcp@azur.ai',
        requester_name: 'MCP User',
        subject: 'MCP test',
        body: 'Ticket created via Model Context Protocol'
      }
    }
  }, { tenant_id: tenant, workflowService, aaasRouter, marketingService: marketingAI });
  assert.equal(r.id, 3);
  assert.equal(r.result.isError, false);
  const content = JSON.parse(r.result.content[0].text);
  assert.ok(content.ticket_id);
  assert.equal(content.priority, 'media');
});

test('MCP unknown method', async () => {
  await assert.rejects(() => handleMCPMessage({ method: 'foo', id: 4 }, { tenant_id: tenant, workflowService, aaasRouter, marketingService: marketingAI }), /Unknown method/);
});

test('MCP tools exported', () => {
  assert.ok(Array.isArray(MCP_TOOLS));
  assert.ok(MCP_TOOLS.length >= 6);
});
