import test from 'node:test';
import assert from 'node:assert/strict';
import stalled from '../src/services/stalledSessionService.js';

test('mark stalled then recover', async () => {
  const { default: db } = await import('../src/services/db.js');
  const id = 'sess-' + Date.now();
  db.prepare(`INSERT INTO chat_sessions (id, tenant_id, user_email, status, handoff_level, last_heartbeat_at, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, 't-stalled', 'u@b', 'active', 0, new Date(Date.now() - 10 * 60 * 1000).toISOString(), '{}', new Date().toISOString(), new Date().toISOString());
  const m = stalled.markStalled(id);
  assert.equal(m.success, true);
  const rec = stalled.recover(id);
  assert.equal(rec.status, 'active');
  const row = db.prepare(`SELECT status FROM chat_sessions WHERE id=?`).get(id);
  assert.equal(row.status, 'active');
});

test('sweep detects old sessions', async () => {
  const { default: db } = await import('../src/services/db.js');
  const id = 'sess-sweep-' + Date.now();
  db.prepare(`INSERT INTO chat_sessions (id, tenant_id, user_email, status, handoff_level, last_heartbeat_at, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, 't-stalled', 'u@b', 'active', 0, new Date(Date.now() - 10 * 60 * 1000).toISOString(), '{}', new Date().toISOString(), new Date().toISOString());
  const r = stalled.runSweep({ tenant_id: 't-stalled', maxAgeMs: 5 * 60 * 1000 });
  assert.ok(r.marked >= 1, JSON.stringify(r));
});
