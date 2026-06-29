import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

export function push({ tenant_id, user_id = null, type = 'info', title, body = '', data = {} }) {
  if (!tenant_id || !title) return null;
  const id = randomId('notif');
  db.prepare('INSERT INTO notifications (id, tenant_id, user_id, type, title, body, data, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)')
    .run(id, tenant_id, user_id, type, title, body, JSON.stringify(data), now());
  return id;
}

export function listNotifications(tenant_id, { user_id, unread_only = false, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM notifications WHERE tenant_id = ?';
  const params = [tenant_id];
  if (user_id) { sql += ' AND (user_id = ? OR user_id IS NULL)'; params.push(user_id); }
  if (unread_only) { sql += ' AND read = 0'; }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  return db.prepare(sql).all(...params, limit, offset).map(rowToNotification);
}

export function markRead(id, tenant_id) {
  return db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND tenant_id = ?').run(id, tenant_id).changes > 0;
}

export function markAllRead(tenant_id, user_id = null) {
  let sql = 'UPDATE notifications SET read = 1 WHERE tenant_id = ? AND read = 0';
  const params = [tenant_id];
  if (user_id) { sql += ' AND (user_id = ? OR user_id IS NULL)'; params.push(user_id); }
  return db.prepare(sql).run(...params).changes;
}

export function unreadCount(tenant_id, user_id = null) {
  let sql = 'SELECT COUNT(*) as c FROM notifications WHERE tenant_id = ? AND read = 0';
  const params = [tenant_id];
  if (user_id) { sql += ' AND (user_id = ? OR user_id IS NULL)'; params.push(user_id); }
  return db.prepare(sql).get(...params).c;
}

export function deleteNotification(id, tenant_id) {
  return db.prepare('DELETE FROM notifications WHERE id = ? AND tenant_id = ?').run(id, tenant_id).changes > 0;
}

function rowToNotification(row) {
  return {
    id: row.id, tenant_id: row.tenant_id, user_id: row.user_id, type: row.type,
    title: row.title, body: row.body, data: safeJson(row.data, {}),
    read: row.read === 1, created_at: row.created_at
  };
}

export default { push, listNotifications, markRead, markAllRead, unreadCount, deleteNotification };