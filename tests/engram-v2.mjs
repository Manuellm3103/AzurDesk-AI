import test from 'node:test';
import assert from 'node:assert/strict';
import * as engramV2 from '../src/services/engramV2Service.js';
import engramService from '../src/services/engramService.js';

test('engram v2 decay y knowledge graph', () => {
  const mem = engramService.remember({ tenant_id: 't-v2', user_id: 'u1', content: 'relación A', type: 'semantic' });
  const imp = engramV2.decayImportance(mem.id);
  assert.ok(imp > 0);
  const mem2 = engramService.remember({ tenant_id: 't-v2', user_id: 'u1', content: 'relación B', type: 'semantic' });
  engramV2.addKnowledgeGraphEdge('t-v2', mem.id, mem2.id, 'related');
  const related = engramV2.getRelatedMemories('t-v2', mem.id);
  assert.equal(related.length, 1);
});
