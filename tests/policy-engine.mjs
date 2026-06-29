import policyEngine from '../src/services/policyEngineService.js';
import { randomUUID } from 'crypto';

// TDD unit tests para policy engine (sin fetch para evitar crashes de libuv).

const tenant = `policy-test-${randomUUID()}`;
let failed = 0;
const assert = (ok, label) => {
  if (ok) console.log('✅', label);
  else { console.log('❌', label); failed++; }
};

// Default allow when no policies
const d0 = policyEngine.decide(tenant, 'mcp', 'tools/call', { agent: { level: 1 }, cost_estimate: 0.5 });
assert(d0.decision === 'allow', 'decide default allow');

// Create deny policy
const p1 = policyEngine.createPolicy(tenant, {
  name: 'Bloquear MCP costoso',
  resource: 'mcp',
  action: 'tools/call',
  conditions: { gte: { 'agent.level': 5 }, gt: { cost_estimate: 1.0 } },
  effect: 'deny',
  priority: 100
});
assert(p1.id && p1.tenant_id === tenant, 'create deny policy');

// Create allow policy
const p2 = policyEngine.createPolicy(tenant, {
  name: 'Permitir MCP barato',
  resource: 'mcp',
  action: 'tools/call',
  conditions: { lte: { cost_estimate: 1.0 } },
  effect: 'allow',
  priority: 50
});
assert(p2.id && p2.tenant_id === tenant, 'create allow policy');

// Deny high cost matching deny policy (priority 100)
const d1 = policyEngine.decide(tenant, 'mcp', 'tools/call', { agent: { level: 5 }, cost_estimate: 1.5 });
assert(d1.decision === 'deny' && d1.policy_id === p1.id, 'deny high cost');

// Allow low cost
const d2 = policyEngine.decide(tenant, 'mcp', 'tools/call', { agent: { level: 1 }, cost_estimate: 0.5 });
assert(d2.decision === 'allow' && d2.policy_id === p2.id, 'allow low cost');

// List policies
const list = policyEngine.listPolicies(tenant);
assert(list.length >= 2, 'list policies');

// Get single policy
const get = policyEngine.getPolicy(p1.id);
assert(get && get.id === p1.id, 'get policy');

// Update policy
const upd = policyEngine.updatePolicy(p1.id, tenant, { priority: 200, enabled: 0 });
assert(upd.priority === 200 && upd.enabled === 0, 'update policy priority + enabled');
// After disabling deny policy, high cost should match p2 allow
const d3 = policyEngine.decide(tenant, 'mcp', 'tools/call', { agent: { level: 5 }, cost_estimate: 1.5 });
assert(d3.decision === 'allow', 'disabled deny policy allows high cost via allow policy');

// Re-enable p1 and verify deny again
policyEngine.updatePolicy(p1.id, tenant, { enabled: 1 });
const d4 = policyEngine.decide(tenant, 'mcp', 'tools/call', { agent: { level: 5 }, cost_estimate: 1.5 });
assert(d4.decision === 'deny', 're-enabled deny policy blocks again');

// Delete policy
const del = policyEngine.deletePolicy(p2.id, tenant);
assert(del === true, 'delete policy');

// Decisions logged (d0, d1, d2, d3, d4 = 5)
const decisions = policyEngine.listDecisions(tenant, { limit: 10 });
assert(decisions.length >= 4, 'decisions logged');

if (failed) { console.log(`\nFAILED: ${failed}`); process.exit(1); }
console.log('\nPOLICY ENGINE: all tests passed');
