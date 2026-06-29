import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import { TokenizerService, ByteBPE } from '../src/ml/tokenizer.js';
import graphRAG from '../src/ml/graphRAG.js';
import memoryService from '../src/services/memoryService.js';
import { routeModel, listModels } from '../src/services/llmRouter.js';

test('tokenizer entrena y codifica/decodifica', () => {
  const ts = new TokenizerService(db);
  const r = ts.train('test-bpe', ['Hola mundo desde AzurDesk AI', 'Soporte TI con inteligencia artificial', 'Tickets y métricas de SLA'], 200);
  assert.ok(r.id);
  assert.ok(r.vocabSize > 0);
  const tokens = ts.encode('Tickets de soporte TI');
  assert.ok(tokens.length > 0);
  const decoded = ts.decode(tokens);
  assert.equal(decoded, 'Tickets de soporte TI');
});

test('GraphRAG extrae entidades y busca', () => {
  graphRAG.upsertArticleGraph({ tenant_id: 't1', article_id: 'a1', title: 'Cómo resetear contraseña de Active Directory', content: 'Si olvidaste tu contraseña de Windows, contacta a TI para restablecer la cuenta.', tags: 'password,ad' });
  const r = graphRAG.search({ tenant_id: 't1', query: 'olvide contraseña windows', limit: 3 });
  assert.ok(r.length > 0);
  assert.ok(r[0].score > 0);
  const g = graphRAG.getGraph('t1');
  assert.ok(g.entities.length > 0);
});

test('MemoryService guarda y recupera recuerdos', () => {
  memoryService.add({ tenant_id: 't1', user_id: 'u1', session_id: 's1', scope: 'session', content: 'El usuario prefiere soporte en español', importance: 2 });
  memoryService.add({ tenant_id: 't1', user_id: 'u1', session_id: 's1', scope: 'session', content: 'Problema recurrente con VPN', importance: 1.5 });
  const r = memoryService.recall({ tenant_id: 't1', user_id: 'u1', session_id: 's1', query: 'idioma español', topK: 2 });
  assert.ok(r.length > 0);
  assert.ok(r.some((m) => m.content.includes('español')));
});

test('LLM Router selecciona modelo activo', () => {
  const models = listModels();
  assert.ok(models.length >= 2);
  const m = routeModel({ complexity: 'low' });
  assert.ok(m);
  assert.ok(m.available !== false);
});
