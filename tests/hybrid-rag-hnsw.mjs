import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hybridSearch } from '../src/services/hybridRAGService.js';
import embeddingService from '../src/services/embeddingService.js';

const mkTenant = (l) => `t-hyb-${l}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

test('hybridSearch returns array even with empty corpus', () => {
  const tenant = mkTenant('empty');
  const r = hybridSearch({ tenant_id: tenant, user_id: 'u1', query: 'anything', topK: 5 });
  assert.ok(Array.isArray(r));
});

test('hybridSearch includes hnsw source when embeddings exist', () => {
  const tenant = mkTenant('with-emb');
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'h1', text: 'sla is 4 hours' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'h2', text: 'password reset instructions' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 'h3', text: 'database is down' });
  const r = hybridSearch({ tenant_id: tenant, user_id: 'u1', query: 'sla', topK: 10 });
  const hnswItems = r.filter((x) => x.source === 'hnsw');
  // With 3 embeddings, useHnsw=false, so still exact
  assert.ok(hnswItems.length >= 1);
  assert.equal(hnswItems[0].algo, 'exact');
});

test('hybridSearch auto-selects HNSW when corpus > 50', () => {
  const tenant = mkTenant('large');
  // Ingest 55 embeddings to trigger HNSW
  for (let i = 0; i < 55; i++) {
    embeddingService.upsert(tenant, {
      source: 'kb',
      sourceId: `art-${i}`,
      text: `doc ${i} sla database error ticket ${i % 10}`
    });
  }
  const r = hybridSearch({ tenant_id: tenant, user_id: 'u1', query: 'sla database', topK: 5 });
  const hnswItems = r.filter((x) => x.source === 'hnsw');
  assert.ok(hnswItems.length >= 1);
  assert.equal(hnswItems[0].algo, 'hnsw');
});

test('hybridSearch returns top-K sorted by score', () => {
  const tenant = mkTenant('sort');
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 's1', text: 'quantum physics' });
  embeddingService.upsert(tenant, { source: 'kb', sourceId: 's2', text: 'quantum entanglement' });
  const r = hybridSearch({ tenant_id: tenant, user_id: 'u1', query: 'quantum', topK: 5 });
  assert.ok(r.length > 0);
  for (let i = 0; i < r.length - 1; i++) {
    assert.ok(r[i].score >= r[i + 1].score, `r[${i}].score=${r[i].score} should be >= r[${i+1}].score=${r[i+1].score}`);
  }
});

test('hybridSearch respects topK limit', () => {
  const tenant = mkTenant('topk');
  for (let i = 0; i < 20; i++) {
    embeddingService.upsert(tenant, { source: 'kb', sourceId: `t${i}`, text: `unique query text ${i} ${Math.random()}` });
  }
  const r = hybridSearch({ tenant_id: tenant, user_id: 'u1', query: 'unique query text', topK: 3 });
  assert.ok(r.length <= 3);
});
