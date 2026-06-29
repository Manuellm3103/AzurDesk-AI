import assert from 'node:assert/strict';
import { test } from 'node:test';
import capacityPlannerService from '../src/services/capacityPlannerService.js';
import db from '../src/services/db.js';

const TENANT = 'tenant-capacity-1';

function clean() {
  db.prepare('DELETE FROM tickets WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM agents WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM agent_mesh_nodes WHERE tenant_id = ?').run(TENANT);
}

test('forecast devuelve métricas de capacidad', () => {
  clean();
  const r = capacityPlannerService.forecast({ tenant_id: TENANT, hours: 4 });
  assert.equal(r.success, true);
  assert.ok('incoming_tickets' in r.forecast);
  assert.ok('rate_per_hour' in r.forecast);
  assert.ok('agents_needed' in r.forecast);
  assert.ok('risk' in r.forecast);
});

test('forecast sube el riesgo cuando hay más tickets que capacidad', () => {
  clean();
  db.prepare('INSERT INTO agents (id, tenant_id, name, role, level, skills, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('agent-1', TENANT, 'A', 'technician', 2, JSON.stringify(['network']), 'idle', new Date().toISOString(), new Date().toISOString());
  const nowIso = new Date().toISOString();
  for (let i = 0; i < 12; i++) {
    db.prepare('INSERT INTO tickets (id, tenant_id, requester_email, requester_name, subject, body, status, priority, level, category, assignee_id, sla_minutes, due_at, sentiment, escalation_risk, tags, channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`t-${i}`, TENANT, 'a@b.com', 'User', 'Red caída', 'network down', 'backlog', 'critica', 3, 'network', '', 60, nowIso, -1, 0.8, JSON.stringify(['red']), 'web', nowIso, nowIso);
  }
  const r = capacityPlannerService.forecast({ tenant_id: TENANT, hours: 4 });
  assert.equal(r.forecast.incoming_tickets, 12);
  assert.equal(r.forecast.active_agents, 1);
  assert.ok(r.forecast.agents_needed > 0);
  assert.ok(['high', 'critical'].includes(r.forecast.risk));
});
