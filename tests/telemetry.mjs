import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import db from '../src/services/db.js';
import TelemetryService from '../src/services/telemetryService.js';

const TENANT = 'tenant-telemetry-1';
const JWT_SECRET = process.env.JWT_SECRET || 'azurdesk-ai-secret-change-in-prod';

function clean() {
  db.prepare('DELETE FROM agents WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM tickets WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM legal_cases WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM agent_mesh_nodes WHERE tenant_id = ?').run(TENANT);
}

function findFreePort() {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function makeToken(tenantId) {
  return jwt.sign({ id: 'test-user', tenant_id: tenantId, role: 'admin', level: 1 }, JWT_SECRET, { expiresIn: '1h' });
}

test('TelemetryService envía snapshot por WebSocket con token válido', async () => {
  clean();
  db.prepare('INSERT INTO agents (id, tenant_id, name, role, level, status, metrics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('agent-t1', TENANT, 'Agente T1', 'technician', 2, 'idle', JSON.stringify({ load_score: 0.6, burnout_risk: 'medium', open_tickets: 4 }), new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO tickets (id, tenant_id, subject, body, status, priority, level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('ticket-t1', TENANT, 'Problema', 'body', 'open', 'critica', 1, new Date().toISOString(), new Date().toISOString());

  const port = await findFreePort();
  const server = createServer();
  const telemetry = new TelemetryService(server);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  try {
    const token = makeToken(TENANT);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/telemetry?token=${token}`);
    const msg = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout websocket')), 5000);
      ws.on('message', (data) => {
        clearTimeout(to);
        try { resolve(JSON.parse(data.toString())); } catch (e) { reject(e); }
      });
      ws.on('error', reject);
    });

    assert.equal(msg.type, 'snapshot');
    assert.equal(msg.data.tenant_id, TENANT);
    assert.equal(msg.data.agents.length, 1);
    assert.equal(msg.data.tickets.open, 1);
    assert.equal(msg.data.tickets.critical, 1);
    assert.ok(msg.data.radar.total >= 0);
    ws.close();
  } finally {
    telemetry.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('TelemetryService rechaza conexión sin token', async () => {
  const port = await findFreePort();
  const server = createServer();
  const telemetry = new TelemetryService(server);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/telemetry`);
    const msg = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout')), 5000);
      ws.on('message', (data) => {
        clearTimeout(to);
        try { resolve(JSON.parse(data.toString())); } catch (e) { reject(e); }
      });
      ws.on('error', reject);
    });
    assert.equal(msg.type, 'error');
    assert.ok(msg.error.includes('Token'));
    ws.close();
  } finally {
    telemetry.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});