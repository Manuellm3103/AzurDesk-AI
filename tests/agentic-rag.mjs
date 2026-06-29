import test from 'node:test';
import assert from 'node:assert/strict';
import arag from '../src/services/agenticRAGService.js';

test('agentic RAG returns plan + sources + summary', async () => {
  const tenant = 't-arag-' + Date.now();
  // seed a kb article
  const { default: db } = await import('../src/services/db.js');
  const id = 'kb-' + Date.now();
  db.prepare(`INSERT INTO kb_articles (id, tenant_id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant, 'Resetear contraseña', 'Para restablecer contraseña contacta a TI.', 'password', new Date().toISOString(), new Date().toISOString());
  const r = await arag.search({ tenant_id: tenant, query: 'olvido contraseña', max_sources: 3 });
  assert.equal(r.success, true);
  assert.ok(Array.isArray(r.sources));
  assert.ok(r.summary.length > 0);
});
