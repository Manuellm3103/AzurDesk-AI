import test from 'node:test';
import assert from 'node:assert/strict';
import engramService from '../src/services/engramService.js';
import { hybridSearch } from '../src/services/hybridRAGService.js';

test('Hybrid RAG busca en KB y memoria', () => {
  engramService.remember({ tenant_id: 'hy1', user_id: 'u1', content: 'Mi impresora es HP LaserJet', type: 'semantic' });
  const r = hybridSearch({ tenant_id: 'hy1', user_id: 'u1', query: 'impresora', topK: 5 });
  assert.ok(r.length > 0);
  assert.ok(r.some(x => x.source === 'memory'));
});
