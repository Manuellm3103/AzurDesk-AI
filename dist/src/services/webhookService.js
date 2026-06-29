import { fetch } from 'undici';
import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [0, 30000, 120000]; // 0s, 30s, 2min

export function enqueue(tenant_id, endpoint_id, event, payload = {}) {
  const id = randomId('whdel');
  db.prepare(`INSERT INTO webhook_deliveries (id, tenant_id, endpoint_id, event, payload, status, attempts, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`)
    .run(id, tenant_id, endpoint_id, event, JSON.stringify(payload), now());
  deliver(id);
  return id;
}

export async function deliver(deliveryId) {
  const row = db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(deliveryId);
  if (!row || row.status === 'delivered' || row.status === 'failed') return;
  const endpoint = db.prepare('SELECT * FROM webhook_endpoints WHERE id = ? AND tenant_id = ? AND active = 1').get(row.endpoint_id, row.tenant_id);
  if (!endpoint) { db.prepare('UPDATE webhook_deliveries SET status = ? WHERE id = ?').run('failed', deliveryId); return; }

  const events = safeJson(endpoint.events, []);
  if (events.length && !events.includes(row.event) && !events.includes('*')) {
    db.prepare('UPDATE webhook_deliveries SET status = ? WHERE id = ?').run('skipped', deliveryId);
    return;
  }

  const attempt = row.attempts + 1;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (endpoint.secret) headers['X-Webhook-Signature'] = endpoint.secret;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event: row.event, data: safeJson(row.payload, {}), timestamp: now(), delivery_id: deliveryId }),
      signal: controller.signal
    });
    clearTimeout(to);
    const body = await r.text().catch(() => '');
    if (r.ok) {
      db.prepare('UPDATE webhook_deliveries SET status = ?, attempts = ?, response_code = ?, response_body = ?, delivered_at = ? WHERE id = ?')
        .run('delivered', attempt, r.status, body.slice(0, 500), now(), deliveryId);
    } else {
      scheduleRetry(deliveryId, attempt, r.status, body);
    }
  } catch (e) {
    scheduleRetry(deliveryId, attempt, 0, e.message);
  }
}

function scheduleRetry(deliveryId, attempt, code, body) {
  if (attempt >= MAX_ATTEMPTS) {
    db.prepare('UPDATE webhook_deliveries SET status = ?, attempts = ?, response_code = ?, response_body = ? WHERE id = ?')
      .run('failed', attempt, code, body.slice(0, 500), deliveryId);
  } else {
    const nextRetry = new Date(Date.now() + RETRY_DELAYS[attempt]).toISOString();
    db.prepare('UPDATE webhook_deliveries SET status = ?, attempts = ?, response_code = ?, response_body = ?, next_retry_at = ? WHERE id = ?')
      .run('retrying', attempt, code, body.slice(0, 500), nextRetry, deliveryId);
  }
}

export function processRetries() {
  const pending = db.prepare("SELECT id FROM webhook_deliveries WHERE status = 'retrying' AND next_retry_at <= ?").all(now());
  for (const row of pending) deliver(row.id);
}

export function listDeliveries(tenant_id, { status, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM webhook_deliveries WHERE tenant_id = ?';
  const params = [tenant_id];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  return db.prepare(sql).all(...params, limit, offset).map(rowToDelivery);
}

function rowToDelivery(row) {
  return {
    id: row.id, tenant_id: row.tenant_id, endpoint_id: row.endpoint_id, event: row.event,
    payload: safeJson(row.payload, {}), status: row.status, attempts: row.attempts,
    response_code: row.response_code, response_body: row.response_body,
    next_retry_at: row.next_retry_at, created_at: row.created_at, delivered_at: row.delivered_at
  };
}

export default { enqueue, deliver, processRetries, listDeliveries };