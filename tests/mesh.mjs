import assert from 'node:assert/strict';
import { test } from 'node:test';
import agentMeshService from '../src/services/agentMeshService.js';
import db from '../src/services/db.js';

const TENANT = 'tenant-mesh-1';

function clean() {
  db.prepare('DELETE FROM agent_mesh_nodes WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM agent_mesh_assignments WHERE tenant_id = ?').run(TENANT);
}

test('publish publica un nodo mesh nuevo', () => {
  clean();
  const r = agentMeshService.publish(TENANT, { agent_id: 'agent-network', name: 'Network Expert', role: 'specialist', level: 3, skills: ['network', 'security'], endpoint: 'http://localhost:9001' });
  assert.equal(r.success, true);
  assert.equal(r.node.name, 'Network Expert');
  assert.deepEqual(r.node.skills, ['network', 'security']);
});

test('publish actualiza nodo existente por agent_id', () => {
  clean();
  agentMeshService.publish(TENANT, { agent_id: 'agent-a', name: 'A', role: 'technician', level: 2, skills: ['diagnose'] });
  const r = agentMeshService.publish(TENANT, { agent_id: 'agent-a', name: 'A Updated', role: 'specialist', level: 3, skills: ['network', 'security'] });
  assert.equal(r.node.name, 'A Updated');
  assert.equal(r.node.level, 3);
  assert.deepEqual(r.node.skills, ['network', 'security']);
});

test('list filtra solo activos ordenados por reputación', () => {
  clean();
  agentMeshService.publish(TENANT, { agent_id: 'x1', name: 'Low', role: 'technician', level: 1, skills: ['triage'] });
  agentMeshService.publish(TENANT, { agent_id: 'x2', name: 'High', role: 'specialist', level: 3, skills: ['network'] });
  agentMeshService.heartbeat(TENANT, 'x2', { reputation: 0.9 });
  const nodes = agentMeshService.list(TENANT);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].name, 'High');
});

test('rankForTicket ordena por skill match, nivel y disponibilidad', () => {
  clean();
  agentMeshService.publish(TENANT, { agent_id: 'net', name: 'Net Pro', role: 'specialist', level: 3, skills: ['network', 'security'] });
  agentMeshService.publish(TENANT, { agent_id: 'gen', name: 'Generalist', role: 'technician', level: 2, skills: ['diagnose', 'kb_search'] });
  agentMeshService.heartbeat(TENANT, 'net', { availability: 0.8, reputation: 0.7 });
  const ranked = agentMeshService.rankForTicket(TENANT, { tags: ['network'], level: 3 });
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].node.name, 'Net Pro');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('bestForTicket devuelve null si no hay match suficiente', () => {
  clean();
  agentMeshService.publish(TENANT, { agent_id: 'gen', name: 'Generalist', role: 'technician', level: 1, skills: ['triage'] });
  const best = agentMeshService.bestForTicket(TENANT, { tags: ['network'], level: 3 }, 0.9);
  assert.equal(best, null);
});

test('assign crea registro de asignación', () => {
  clean();
  agentMeshService.publish(TENANT, { agent_id: 'sp', name: 'Specialist', role: 'specialist', level: 3, skills: ['network'] });
  const node = agentMeshService.list(TENANT)[0];
  const r = agentMeshService.assign(TENANT, 'ticket-1', node.id, 'skill match network', 0.85);
  assert.equal(r.success, true);
  assert.equal(r.assignment.score, 0.85);
});

test('heartbeat actualiza disponibilidad', () => {
  clean();
  agentMeshService.publish(TENANT, { agent_id: 'hb', name: 'HB', role: 'technician', level: 2, skills: ['diagnose'] });
  const r = agentMeshService.heartbeat(TENANT, 'hb', { availability: 0.42, metrics: { cpu: 12 } });
  assert.equal(r.availability, 0.42);
  assert.equal(r.metadata.cpu, 12);
});

test('createTicket asigna automáticamente al mejor nodo mesh en ticket crítico', async () => {
  clean();
  db.prepare('DELETE FROM tickets WHERE tenant_id = ?').run(TENANT);
  agentMeshService.publish(TENANT, { agent_id: 'net-pro', name: 'Network Pro', role: 'specialist', level: 3, skills: ['network', 'security'] });
  agentMeshService.heartbeat(TENANT, 'net-pro', { availability: 0.9, reputation: 0.8 });
  agentMeshService.publish(TENANT, { agent_id: 'general', name: 'General', role: 'technician', level: 1, skills: ['triage'] });
  const helpdesk = (await import('../src/helpdesk/helpdeskService.js')).default;
  const r = helpdesk.createTicket({
    tenant_id: TENANT,
    requester_email: 'user@corp.com',
    requester_name: 'Usuario',
    subject: 'Caída total de red',
    body: 'Urgente: toda la red corporativa está caída, no hay acceso a servidores. Falla crítica de network.',
    category: 'network',
    channel: 'web'
  });
  assert.equal(r.success, true);
  assert.equal(r.ticket.assignee_id, 'net-pro');
  assert.ok(r.ticket.level >= 3);
});
