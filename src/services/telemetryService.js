import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { safeJson } from './_utils.js';
import radarService from './radarService.js';
import agentMeshService from './agentMeshService.js';

import notificationService from './notificationService.js';

const TELEMETRY_INTERVAL_MS = 5000;
const SNAPSHOT_TTL_MS = 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'azurdesk-ai-secret-change-in-prod';
const snapshotCache = new Map();

function getSnapshot(tenant_id) {
  const cached = snapshotCache.get(tenant_id);
  if (cached && Date.now() - cached.ts < SNAPSHOT_TTL_MS) return cached.data;
  const agents = db.prepare('SELECT * FROM agents WHERE tenant_id = ?').all(tenant_id);
  const nodes = db.prepare('SELECT * FROM agent_mesh_nodes WHERE tenant_id = ? AND active = 1').all(tenant_id);
  const openTickets = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE tenant_id = ? AND status NOT IN (\'closed\',\'resolved\')').get(tenant_id).n;
  const criticalTickets = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE tenant_id = ? AND status NOT IN (\'closed\',\'resolved\') AND priority IN (\'critica\',\'critical\')').get(tenant_id).n;
  const radar = radarService.buildRadar({ tenant_id });

  const result = {
    ts: new Date().toISOString(),
    tenant_id,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      load_score: (safeJson(a.metrics, {}) || {}).load_score || 0,
      burnout_risk: (safeJson(a.metrics, {}) || {}).burnout_risk || 'unknown',
      open_tickets: (safeJson(a.metrics, {}) || {}).open_tickets || 0
    })),
    mesh: nodes.map((n) => ({
      id: n.id,
      agent_id: n.agent_id,
      name: n.name,
      role: n.role,
      availability: n.availability,
      reputation: n.reputation,
      last_seen: n.last_seen
    })),
    tickets: { open: openTickets, critical: criticalTickets },
    radar: { total: radar.total, critical: radar.critical, high: radar.high }
  };
  snapshotCache.set(tenant_id, { ts: Date.now(), data: result });
  return result;
}

class TelemetryService {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws/telemetry' });
    this.clients = new Map(); // ws -> { tenant_id }
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.interval = setInterval(() => this.broadcast(), TELEMETRY_INTERVAL_MS);
  }

  handleConnection(ws, req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    let tenant_id = null;
    let user_id = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        tenant_id = decoded.tenant_id;
        user_id = decoded.user_id;
      } catch {
        ws.send(JSON.stringify({ type: 'error', error: 'Token inválido' }));
        ws.close(4001, 'Token inválido');
        return;
      }
    }
    if (!tenant_id) {
      ws.send(JSON.stringify({ type: 'error', error: 'Token requerido' }));
      ws.close(4001, 'Token requerido');
      return;
    }
    this.clients.set(ws, { tenant_id, user_id });
    if (ws.readyState === 1) {
      try { ws.send(JSON.stringify({ type: 'snapshot', data: getSnapshot(tenant_id) })); } catch {}
    }

    ws.on('message', (data) => {
      try {
        const msg = safeJson(data.toString(), {});
        if (msg.method === 'notifications:markRead') {
          if (msg.id) notificationService.markRead(msg.id, tenant_id);
          else notificationService.markAllRead(tenant_id, user_id);
          ws.send(JSON.stringify({ type: 'notifications', data: { unread: notificationService.unreadCount(tenant_id, user_id), notifications: notificationService.listNotifications(tenant_id, { user_id, limit: 10 }) } }));
        }
        if (msg.method === 'notifications:list') {
          ws.send(JSON.stringify({ type: 'notifications', data: { unread: notificationService.unreadCount(tenant_id, user_id), notifications: notificationService.listNotifications(tenant_id, { user_id, limit: 10 }) } }));
        }
      } catch {}
    });

    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));
  }

  broadcast() {
    if (!this.clients.size) return;
    const perTenant = new Map();
    for (const [, meta] of this.clients) {
      if (!perTenant.has(meta.tenant_id)) {
        perTenant.set(meta.tenant_id, getSnapshot(meta.tenant_id));
      }
    }
    for (const [ws, meta] of this.clients) {
      if (ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'snapshot', data: perTenant.get(meta.tenant_id) })); } catch {}
        try {
          const unread = notificationService.unreadCount(meta.tenant_id, meta.user_id);
          ws.send(JSON.stringify({ type: 'notifications', data: { unread, notifications: notificationService.listNotifications(meta.tenant_id, { user_id: meta.user_id, limit: 10 }) } }));
        } catch {}
      }
    }
  }

  stop() {
    clearInterval(this.interval);
    this.wss.close();
  }
}

export default TelemetryService;
