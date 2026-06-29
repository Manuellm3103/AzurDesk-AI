import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import * as meetingPipelineService from '../src/services/meetingPipelineService.js';

const tenantId = 'tenant-meeting-test';

function now() { return new Date().toISOString(); }

test('Extrae accionables de resumen de Teams y crea tickets', () => {
  db.prepare('INSERT OR IGNORE INTO tenants (id, name, plan, created_at) VALUES (?, ?, ?, ?)').run(tenantId, 'Test', 'free', now());
  const r = meetingPipelineService.processSummary({
    title: 'Sprint Review',
    summary: 'Juan revisará el ticket VPN-42 para mañana. María actualizará la documentación.',
    tenant_id: tenantId
  });
  assert.equal(r.action_items.length, 2);
  assert.ok(r.action_items[0].text.includes('Juan'));
  assert.ok(r.tickets_created.length >= 1);
  assert.ok(r.note.includes('Sprint Review'));
});

test('Requiere tenant_id y summary', () => {
  assert.throws(() => meetingPipelineService.processSummary({ title: 'x' }));
});
