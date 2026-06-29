import sandbox from '../src/services/agentSandboxService.js';
import { randomUUID } from 'crypto';

// TDD para Agent Sandbox.

const tenant = `sandbox-test-${randomUUID()}`;
const agentId = `agent-${randomUUID()}`;
let failed = 0;
const assert = (ok, label) => {
  if (ok) console.log('✅', label);
  else { console.log('❌', label); failed++; }
};

// Crear sandbox
const sb = sandbox.createSandbox(tenant, agentId, { runtime: 'vm2', allow_network: false, allowed_tools: ['read', 'calc'], resource_limits: { max_ms: 5000 } });
assert(sb.id && sb.status === 'created' && sb.runtime === 'vm2', 'create sandbox');

// Start
const running = sandbox.startSandbox(sb.id, tenant);
assert(running.status === 'running', 'start sandbox');

// Execute allowed tool
const out1 = sandbox.executeInSandbox(sb.id, tenant, { tool: 'calc', args: { expr: '1+1' } });
assert(out1.tool === 'calc' && out1.status === 'ok', 'execute allowed tool');

// Execute denied tool throws
let threw = false;
try {
  sandbox.executeInSandbox(sb.id, tenant, { tool: 'network', args: {} });
} catch (e) {
  threw = true;
}
assert(threw, 'deny disallowed tool');

// Stop
const stopped = sandbox.stopSandbox(sb.id, tenant, { result: { value: 2 } });
assert(stopped.status === 'stopped', 'stop sandbox');

// List
const list = sandbox.listSandboxes(tenant, { status: 'stopped' });
assert(list.length >= 1 && list[0].id === sb.id, 'list sandboxes by status');

// Executions logged
const execs = sandbox.listExecutions(tenant, { sandbox_id: sb.id });
assert(execs.length >= 1 && execs[0].tool === 'calc', 'executions logged');

// Delete
const del = sandbox.deleteSandbox(sb.id, tenant);
assert(del === true, 'delete sandbox');

if (failed) { console.log(`\nFAILED: ${failed}`); process.exit(1); }
console.log('\nSANDBOX: all tests passed');
