import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mcpGatewayService from '../src/services/mcpGatewayService.js';

const TENANT = 'tenant-mcp-gateway-test';

describe('mcpGatewayService', () => {
  it('register and get tool', () => {
    const t = mcpGatewayService.registerTool(TENANT, { server_id: 'github', tool_name: 'create_issue', rate_limit_rpm: 10, cost_per_call: 0.05 });
    assert.equal(t.tenant_id, TENANT);
    assert.equal(t.server_id, 'github');
    assert.equal(t.tool_name, 'create_issue');
    assert.equal(t.rate_limit_rpm, 10);
    assert.equal(t.cost_per_call, 0.05);
    assert.equal(t.enabled, true);
    const g = mcpGatewayService.getTool(TENANT, t.id);
    assert.equal(g.id, t.id);
  });

  it('list tools filters by server', () => {
    const t1 = mcpGatewayService.registerTool(TENANT, { server_id: 'slack', tool_name: 'send_message' });
    const list = mcpGatewayService.listTools(TENANT, { server_id: 'slack' });
    assert.ok(list.some(t => t.id === t1.id));
  });

  it('rate limit blocks after rpm calls', async () => {
    const tool = mcpGatewayService.registerTool(TENANT, { server_id: 'notion', tool_name: 'create_page', rate_limit_rpm: 2, cost_per_call: 0 });
    const r1 = await mcpGatewayService.call(TENANT, tool.id, { title: 'A' });
    assert.equal(r1.success, true);
    const r2 = await mcpGatewayService.call(TENANT, tool.id, { title: 'B' });
    assert.equal(r2.success, true);
    const r3 = await mcpGatewayService.call(TENANT, tool.id, { title: 'C' });
    assert.equal(r3.success, false);
    assert.ok(r3.error.includes('rate limit'));
  });

  it('billing records charge when cost > 0', async () => {
    const tool = mcpGatewayService.registerTool(TENANT, { server_id: 'github', tool_name: 'search_code', rate_limit_rpm: 60, cost_per_call: 0.10 });
    const r = await mcpGatewayService.call(TENANT, tool.id, { query: 'todo' });
    assert.equal(r.success, true);
    assert.equal(r.cost, 0.10);
    const totals = mcpGatewayService.totals(TENANT);
    const row = totals.find(t => t.server_id === 'github' && t.tool_name === 'search_code');
    assert.ok(row);
    assert.equal(row.calls >= 1, true);
  });

  it('disable tool blocks calls', async () => {
    const tool = mcpGatewayService.registerTool(TENANT, { server_id: 'google-calendar', tool_name: 'list_events' });
    mcpGatewayService.updateTool(TENANT, tool.id, { enabled: false });
    const r = await mcpGatewayService.call(TENANT, tool.id, {});
    assert.equal(r.success, false);
  });

  it('delete tool', () => {
    const tool = mcpGatewayService.registerTool(TENANT, { server_id: 'github', tool_name: 'delete_me' });
    assert.equal(mcpGatewayService.deleteTool(TENANT, tool.id), true);
    assert.equal(mcpGatewayService.getTool(TENANT, tool.id), null);
  });
});
