import assert from 'node:assert/strict';
import { test } from 'node:test';
import db from '../src/services/db.js';
import webhookService from '../src/services/webhookService.js';
import promptTemplateService from '../src/services/promptTemplateService.js';
import notificationService from '../src/services/notificationService.js';

const T = 'tenant-innov-test';

function clean() {
  for (const t of ['webhook_deliveries', 'webhook_endpoints', 'prompt_templates', 'notifications']) {
    try { db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(T); } catch {}
  }
}

test('webhook delivery enqueues and lists', () => {
  clean();
  db.prepare('INSERT INTO webhook_endpoints (id, tenant_id, name, url, events, secret, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
    .run('wh-test', T, 'TestHook', 'https://httpbin.org/post', JSON.stringify(['ticket.created']), '', new Date().toISOString());
  const id = webhookService.enqueue(T, 'wh-test', 'ticket.created', { ticket_id: 't1' });
  assert.ok(id);
  const deliveries = webhookService.listDeliveries(T);
  assert.ok(deliveries.length >= 1);
  assert.ok(['pending', 'delivered', 'retrying', 'failed'].includes(deliveries[0].status));
});

test('prompt template CRUD + render', () => {
  clean();
  const tmpl = promptTemplateService.createTemplate(T, {
    name: 'Greeting Bot',
    category: 'customer_service',
    system_prompt: 'You are a {{role}} assistant.',
    user_template: 'Hello {{name}}, how can I help with {{topic}}?',
    variables: ['role', 'name', 'topic']
  });
  assert.ok(tmpl.id);
  assert.equal(tmpl.name, 'Greeting Bot');
  assert.deepEqual(tmpl.variables, ['role', 'name', 'topic']);

  const rendered = promptTemplateService.renderTemplate(tmpl, { role: 'support', name: 'Alice', topic: 'billing' });
  assert.equal(rendered.system, 'You are a support assistant.');
  assert.equal(rendered.user, 'Hello Alice, how can I help with billing?');

  const got = promptTemplateService.getTemplate(tmpl.id, T);
  assert.equal(got.name, 'Greeting Bot');

  const list = promptTemplateService.listTemplates(T);
  assert.equal(list.length, 1);

  const updated = promptTemplateService.updateTemplate(tmpl.id, T, { name: 'Support Bot' });
  assert.equal(updated.name, 'Support Bot');

  assert.equal(promptTemplateService.deleteTemplate(tmpl.id, T), true);
  assert.equal(promptTemplateService.getTemplate(tmpl.id, T), null);
});

test('notification push → list → markRead → unreadCount → markAllRead', () => {
  const TN = 'tenant-notif-main';
  try { db.prepare('DELETE FROM notifications WHERE tenant_id = ?').run(TN); } catch {}
  notificationService.push({ tenant_id: TN, type: 'alert', title: 'Ticket crítico', body: 'Ticket #123 requiere atención', data: { ticket_id: 't123' } });
  notificationService.push({ tenant_id: TN, type: 'info', title: 'Bienvenido', body: 'Sistema operativo' });

  let list = notificationService.listNotifications(TN);
  assert.equal(list.length, 2);
  assert.equal(list[0].read, false);

  assert.equal(notificationService.unreadCount(TN), 2);

  notificationService.markRead(list[0].id, TN);
  assert.equal(notificationService.unreadCount(TN), 1);

  const marked = notificationService.markAllRead(TN);
  assert.equal(marked, 1);
  assert.equal(notificationService.unreadCount(TN), 0);

  const unreadOnly = notificationService.listNotifications(TN, { unread_only: true });
  assert.equal(unreadOnly.length, 0);
});

test('notification delete', () => {
  const TD = 'tenant-notif-del';
  try { db.prepare('DELETE FROM notifications WHERE tenant_id = ?').run(TD); } catch {}
  const id = notificationService.push({ tenant_id: TD, title: 'To Delete' });
  assert.equal(notificationService.deleteNotification(id, TD), true);
  assert.equal(notificationService.listNotifications(TD).length, 0);
});