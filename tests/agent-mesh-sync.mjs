import test from 'node:test';
import assert from 'node:assert/strict';
import mesh from '../src/services/agentMeshSyncService.js';

test('heartbeat creates and updates node', () => {
  const tenant = 't-mesh-' + Date.now();
  const aid = 'm1-' + Date.now();
  const r1 = mesh.heartbeat({ tenant_id: tenant, agent_id: aid, name: 'Node A', role: 'worker', level: 1, skills: ['network'], endpoint: 'http://m1' });
  assert.equal(r1.action, 'created');
  const r2 = mesh.heartbeat({ tenant_id: tenant, agent_id: aid, name: 'Node A', role: 'worker', level: 1, skills: ['network'], endpoint: 'http://m1' });
  assert.equal(r2.action, 'updated');
  const active = mesh.listActive(tenant);
  assert.equal(active.length, 1);
});

test('prune inactive nodes', () => {
  const tenant = 't-mesh2-prune-' + Date.now();
  mesh.heartbeat({ tenant_id: tenant, agent_id: 'old-' + Date.now(), name: 'Old', role: 'worker', level: 1, skills: [], endpoint: 'http://old' });
  const before = mesh.listActive(tenant, 60000).length;
  const pruned = mesh.pruneInactive(1);
  assert.ok(pruned.pruned >= before, `pruned ${pruned.pruned} but active was ${before}`);
});
