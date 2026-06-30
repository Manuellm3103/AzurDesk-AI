import { test } from 'node:test';
import assert from 'node:assert/strict';
import embeddingService from '../src/services/embeddingService.js';

const mkTenant = (label) => `t-emb-${label}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

test('upsert stores a 256-dim vector and returns id', () => {
  const tenant = mkTenant('upsert');
  const r = embeddingService.upsert(tenant, { source: 'kb', sourceId: 'art-1', text: 'SLA is 4 hours' });
  assert.ok(r.id);
  assert.equal(r.dim, 256);
});

test('upsert is idempotent on (tenant, source, sourceId)', () => {
  const tenant = mkTenant('idem');
  const a = embeddingService.upsert(tenant, { source: 'kb', sourceId: 'art-2', text: 'First' });
  const b = embeddingService.upsert(tenant, { source: 'kb', sourceId: 'art-2', text: 'Updated' });
  assert.equal(a.id, b.id);
  assert.equal(b.updated, true);
});

test('search returns top-k results sorted by similarity', () => {
  const tenant = mkTenant('search');
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'a', text: 'login fails on production' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'b', text: 'database is down' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'c', text: 'password reset instructions' });
  const results = embeddingService.search(tenant, { query: 'login broken', k: 3 });
  assert.equal(results.length, 3);
  assert.ok(results[0].score >= results[1].score);
  assert.ok(results[1].score >= results[2].score);
});

test('search filters by source', () => {
  const tenant = mkTenant('filter');
  embeddingService.upsert(tenant, { source: 'kb', sourceId: '1', text: 'kb doc' });
  embeddingService.upsert(tenant, { source: 'ticket', sourceId: '1', text: 'ticket doc' });
  const r = embeddingService.search(tenant, { query: 'doc', k: 10, source: 'kb' });
  assert.ok(r.length >= 1);
  for (const item of r) assert.equal(item.source, 'kb');
});

test('hnswSearch returns ranked results with cross-distance refinement', () => {
  const tenant = mkTenant('hnsw');
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'x1', text: 'alpha bravo charlie' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'x2', text: 'alpha delta echo' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'x3', text: 'foxtrot golf hotel' });
  const results = embeddingService.hnswSearch(tenant, { query: 'alpha', k: 2, ef: 10 });
  assert.ok(results.length >= 1);
  assert.equal(results[0].hnsw_layer, 'base');
  assert.ok(results[0].score >= 0);
});

test('hybridSearch combines semantic + keyword scores', () => {
  const tenant = mkTenant('hybrid');
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'h1', text: 'The SLA is 4 hours' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'h2', text: 'Network is slow' });
  const r = embeddingService.hybridSearch(tenant, { query: 'SLA hours', k: 2 });
  assert.equal(r.length, 2);
  assert.ok(r[0].semantic !== undefined);
  assert.ok(r[0].keyword !== undefined);
  // SLA document should be top because it has both semantic + keyword match
  assert.equal(r[0].source_id, 'h1');
});

test('stats returns total + by_source breakdown', () => {
  const tenant = mkTenant('stats');
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 's1', text: 'doc 1' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 's2', text: 'doc 2' });
  embeddingService.upsert(tenant, { source: 'ticket', sourceId: 's3', text: 'ticket 1' });
  const s = embeddingService.stats(tenant);
  assert.ok(s.total >= 3);
  assert.equal(s.dim, 256);
  const sources = s.by_source.map((x) => x.source);
  assert.ok(sources.includes('kb'));
  assert.ok(sources.includes('ticket'));
});

test('delete by (source, sourceId) removes only that entry', () => {
  const tenant = mkTenant('del');
  // Use very distinct tokens to ensure no cross-match
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'd1', text: 'quantum entanglement physics' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'd2', text: 'tropical banana smoothie' });
  const removed = embeddingService.delete(tenant, { source: 'kb', sourceId: 'd2' });
  assert.equal(removed, 1);
  // After delete, search for banana should return 0
  const r = embeddingService.search(tenant, { query: 'banana smoothie tropical', k: 10, threshold: 0.1 });
  assert.equal(r.length, 0);
  // Quantum should still be there
  const r2 = embeddingService.search(tenant, { query: 'quantum entanglement physics', k: 10 });
  assert.ok(r2.length >= 1);
  assert.equal(r2[0].source_id, 'd1');
});

test('delete by source removes all entries for that source', () => {
  const tenant = mkTenant('del-src');
  embeddingService.upsert(tenant, { source: 'tmp', sourceId: '1', text: 'a' });
  embeddingService.upsert(tenant, { source: 'tmp', sourceId: '2', text: 'b' });
  embeddingService.upsert(tenant, { source: 'keep', sourceId: '1', text: 'c' });
  const removed = embeddingService.delete(tenant, { source: 'tmp' });
  assert.equal(removed, 2);
  const r = embeddingService.search(tenant, { query: 'a', k: 10, source: 'tmp' });
  assert.equal(r.length, 0);
});

test('get returns metadata without raw vector', () => {
  const tenant = mkTenant('get');
  const u = embeddingService.upsert(tenant, { source: 'kb', sourceId: 'g1', text: 'test' });
  const g = embeddingService.get(u.id);
  assert.ok(g);
  assert.equal(g.text, 'test');
  assert.equal(g.vector, undefined);
});
