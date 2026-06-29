import test from 'node:test';
import assert from 'node:assert/strict';
import aaasRouter from '../src/services/aaasRouterService.js';

test('normalize multimodal payload', () => {
  const payload = [
    { role: 'user', content: [{ type: 'text', text: 'Analiza' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }] }
  ];
  const models = aaasRouter.buildCandidates('no-tenant', { complexity: 'medium', multimodal: true });
  // no candidates in empty tenant; just verify function exports
  assert.ok(Array.isArray(models));
});

test('listAvailableModels devuelve array', () => {
  const m = aaasRouter.listAvailableModels('no-tenant');
  assert.ok(Array.isArray(m));
});
