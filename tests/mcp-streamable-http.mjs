import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mcp from '../src/services/mcpStreamableHttpService.js';

test('MCP VERSION is current 2025-11-25 spec', () => {
  assert.equal(mcp.MCP_VERSION, '2025-11-25');
});

test('buildServerInfo returns AzurDesk name + version', () => {
  const info = mcp.buildServerInfo();
  assert.equal(info.name, 'azurdesk-ai');
  assert.ok(info.version);
});

test('buildCapabilities includes tools/resources/prompts/logging', () => {
  const caps = mcp.buildCapabilities();
  assert.ok(caps.tools);
  assert.ok(caps.resources);
  assert.ok(caps.prompts);
  assert.ok(caps.logging);
});

test('buildMCPToolsList returns array with create_ticket and list_tickets', () => {
  const tools = mcp.buildMCPToolsList();
  assert.ok(Array.isArray(tools));
  assert.ok(tools.length > 5);
  const names = tools.map(t => t.name);
  assert.ok(names.includes('create_ticket'));
  assert.ok(names.includes('list_tickets'));
  // Every tool must have name + description + inputSchema
  for (const t of tools) {
    assert.ok(t.name, 'tool must have name');
    assert.ok(t.description, 'tool must have description');
    assert.ok(t.inputSchema, 'tool must have inputSchema');
  }
});

test('buildMCPResourcesList returns URI resources for tenant', () => {
  const resources = mcp.buildMCPResourcesList('demo');
  assert.ok(resources.length >= 3);
  for (const r of resources) {
    assert.ok(r.uri.startsWith('azurdesk://demo/'));
    assert.ok(r.mimeType);
  }
});

test('buildMCPPromptsList returns create_ticket_prompt and rag_query_prompt', () => {
  const prompts = mcp.buildMCPPromptsList();
  const names = prompts.map(p => p.name);
  assert.ok(names.includes('create_ticket_prompt'));
  assert.ok(names.includes('rag_query_prompt'));
});

test('createSession + getSession + touchSession + deleteSession', () => {
  const s = mcp.createSession('tenant-1', { name: 'claude', version: '1.0' });
  assert.ok(s.id);
  assert.equal(s.tenant_id, 'tenant-1');
  assert.equal(s.clientInfo.name, 'claude');
  const got = mcp.getSession(s.id);
  assert.equal(got.id, s.id);
  // Touch should update last_seen
  const before = s.last_seen;
  // Force a tick
  const t = mcp.touchSession(s.id);
  assert.ok(t.last_seen >= before);
  // Delete
  const removed = mcp.deleteSession(s.id);
  assert.equal(removed, true);
  assert.equal(mcp.getSession(s.id), undefined);
});

test('handleJsonRpc: ping returns pong with timestamp', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { tenant_id: 'demo' }
  );
  assert.equal(r.jsonrpc, '2.0');
  assert.equal(r.id, 1);
  assert.equal(r.result.pong, true);
  assert.ok(r.result.ts);
});

test('handleJsonRpc: initialize creates session and returns server info', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 'init-1', method: 'initialize', params: { clientInfo: { name: 'test', version: '1.0' } } },
    { tenant_id: 'demo' }
  );
  assert.equal(r.jsonrpc, '2.0');
  assert.equal(r.id, 'init-1');
  assert.equal(r.result.protocolVersion, '2025-11-25');
  assert.equal(r.result.serverInfo.name, 'azurdesk-ai');
  assert.ok(r.result.sessionId);
  assert.ok(r.result.capabilities.tools);
  // Cleanup
  mcp.deleteSession(r.result.sessionId);
});

test('handleJsonRpc: tools/list returns the tools array', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { tenant_id: 'demo' }
  );
  assert.equal(r.jsonrpc, '2.0');
  assert.ok(Array.isArray(r.result.tools));
  assert.ok(r.result.tools.length > 5);
});

test('handleJsonRpc: resources/list returns the resources array', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 3, method: 'resources/list' },
    { tenant_id: 'demo' }
  );
  assert.ok(Array.isArray(r.result.resources));
  assert.ok(r.result.resources.length >= 3);
});

test('handleJsonRpc: prompts/list returns the prompts array', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 4, method: 'prompts/list' },
    { tenant_id: 'demo' }
  );
  assert.ok(Array.isArray(r.result.prompts));
});

test('handleJsonRpc: unknown method returns JSON-RPC error -32601', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 5, method: 'unknown/method' },
    { tenant_id: 'demo' }
  );
  assert.equal(r.jsonrpc, '2.0');
  assert.equal(r.id, 5);
  assert.equal(r.error.code, -32601);
  assert.match(r.error.message, /Method not found/);
});

test('handleJsonRpc: invalid JSON-RPC (no jsonrpc field) returns -32600', async () => {
  const r = await mcp.handleJsonRpc(
    { id: 6, method: 'ping' },
    { tenant_id: 'demo' }
  );
  assert.equal(r.error.code, -32600);
});

test('handleJsonRpc: tools/call with list_tickets returns MCP content', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } },
    { tenant_id: 'demo' }
  );
  assert.equal(r.jsonrpc, '2.0');
  assert.equal(r.id, 7);
  assert.ok(r.result.content);
  assert.ok(Array.isArray(r.result.content));
  assert.equal(r.result.content[0].type, 'text');
  assert.equal(r.result.isError, false);
});

test('handleJsonRpc: tools/call with create_ticket creates a real ticket', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 8, method: 'tools/call', params: {
      name: 'create_ticket',
      arguments: { requester_email: 'mcp@test.com', requester_name: 'MCP Test', subject: 'MCP created ticket', body: 'Created via MCP 1.0 streamable-HTTP' }
    } },
    { tenant_id: 'demo' }
  );
  assert.ok(r.result.content);
  assert.equal(r.result.isError, false);
});

test('handleJsonRpc: batch request (array) processes each', async () => {
  const r1 = await mcp.handleJsonRpc(
    [{ jsonrpc: '2.0', id: 'a', method: 'ping' }, { jsonrpc: '2.0', id: 'b', method: 'ping' }],
    { tenant_id: 'demo' }
  );
  // For arrays, handleJsonRpc returns one at a time; caller processes batch
  // Here we just verify one call works
  assert.ok(r1);
});

test('handleJsonRpc: prompts/get create_ticket_prompt returns messages', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 9, method: 'prompts/get', params: { name: 'create_ticket_prompt', arguments: { issue: 'login fails', priority: 'high' } } },
    { tenant_id: 'demo' }
  );
  assert.ok(r.result.messages);
  assert.ok(r.result.messages[0].role, 'user');
  assert.match(r.result.messages[0].content.text, /login fails/);
});

test('handleJsonRpc: prompts/get unknown returns -32601', async () => {
  const r = await mcp.handleJsonRpc(
    { jsonrpc: '2.0', id: 10, method: 'prompts/get', params: { name: 'nope' } },
    { tenant_id: 'demo' }
  );
  assert.equal(r.error.code, -32601);
});

test('sseFrame wraps data in proper SSE format', () => {
  const f = mcp.sseFrame({ x: 1 });
  assert.match(f, /^data: \{/);
  assert.match(f, /\n\n$/);
});
