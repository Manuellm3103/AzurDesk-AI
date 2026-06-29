import test from 'node:test';
import assert from 'node:assert/strict';
import engramService from '../src/services/engramService.js';

test('remember y recall', () => {
  engramService.remember({ tenant_id: 't1', user_id: 'u1', content: 'Cliente prefiere respuestas en español', type: 'semantic' });
  const r = engramService.recall({ tenant_id: 't1', user_id: 'u1', query: 'idioma preferido', topK: 3 });
  assert.ok(r.length > 0);
  assert.ok(r[0].content.includes('español'));
});

test('consolidate crea resumen', () => {
  for (let i = 0; i < 5; i++) {
    engramService.remember({ tenant_id: 't2', user_id: 'u2', content: `evento ${i}-${Date.now()}` });
  }
  const s = engramService.consolidate({ tenant_id: 't2', user_id: 'u2' });
  assert.ok(s.summary);
  assert.ok(s.based_on >= 5);
});

test('forget elimina memoria', () => {
  engramService.remember({ tenant_id: 't3', user_id: 'u3', content: 'dato a borrar', importance: 0.5 });
  const before = engramService.recall({ tenant_id: 't3', user_id: 'u3', query: 'dato', topK: 1 });
  assert.ok(before.length > 0);
  const f = engramService.forget({ tenant_id: 't3', user_id: 'u3' });
  assert.equal(f.deleted, 1);
});
