import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMCPMessage, MCP_TOOLS } from '../src/services/mcpExpandedService.js';

test('MCP expanded tools/list', async () => {
  const r = await handleMCPMessage({ method: 'tools/list', id: 1 }, { tenant_id: 't-mcp' });
  assert.equal(r.jsonrpc, '2.0');
  assert.ok(r.result.tools.length > 8);
});

test('MCP create_ticket tool call', async () => {
  const r = await handleMCPMessage({ method: 'tools/call', id: 2, params: { name: 'create_ticket', arguments: { requester_email: 'a@b.com', requester_name: 'A', subject: 'Test', body: 'Body' } } }, { tenant_id: 't-mcp' });
  assert.equal(r.jsonrpc, '2.0');
  assert.ok(r.result.content[0].text.includes('ticket'));
});

test('MCP unknown tool returns error', async () => {
  const r = await handleMCPMessage({ method: 'tools/call', id: 3, params: { name: 'nope', arguments: {} } }, { tenant_id: 't-mcp' });
  assert.ok(r.error);
});
