import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

export function log({ tenant_id, actor_id = 'system', actor_type = 'user', action, resource_type, resource_id = null, details = {}, ip_address = null, user_agent = null }) {
  if (!tenant_id || !action) return null;
  const id = randomId('audit');
  db.prepare(`INSERT INTO audit_logs (id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, JSON.stringify(details), ip_address, user_agent, now());
  return id;
}

export function listLogs(tenant_id, { action, resource_type, actor_id, limit = 100, offset = 0 } = {}) {
  let sql = 'SELECT * FROM audit_logs WHERE tenant_id = ?';
  const params = [tenant_id];
  if (action) { sql += ' AND action = ?'; params.push(action); }
  if (resource_type) { sql += ' AND resource_type = ?'; params.push(resource_type); }
  if (actor_id) { sql += ' AND actor_id = ?'; params.push(actor_id); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  return db.prepare(sql).all(...params, limit, offset).map(rowToLog);
}

export function getLog(id, tenant_id) {
  const row = db.prepare('SELECT * FROM audit_logs WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  return row ? rowToLog(row) : null;
}

export function countByAction(tenant_id, action) {
  return db.prepare('SELECT COUNT(*) as c FROM audit_logs WHERE tenant_id = ? AND action = ?').get(tenant_id, action).c;
}

function rowToLog(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    actor_id: row.actor_id,
    actor_type: row.actor_type,
    action: row.action,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    details: safeJson(row.details, {}),
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: row.created_at
  };
}

export default { log, listLogs, getLog, countByAction };