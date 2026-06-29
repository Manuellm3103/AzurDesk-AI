import test from 'node:test';
import assert from 'node:assert/strict';
import costRouter from '../src/services/costRouterService.js';

test('cost router clasifica simple vs complex', () => {
  const simple = costRouter.route({ tenant_id: 't1', text: 'hola', availableModels: [{ provider_id: 'p1', model_id: 'cheap', cost_per_1m: 0.5, quality: 0.6 }, { provider_id: 'p2', model_id: 'quality', cost_per_1m: 5.0, quality: 0.9 }] });
  assert.equal(simple.simple, true);
  assert.equal(simple.model_id, 'cheap');
  const complex = costRouter.route({ tenant_id: 't1', text: 'realiza una auditoría de seguridad profunda con root cause', availableModels: [{ provider_id: 'p1', model_id: 'cheap', cost_per_1m: 0.5, quality: 0.6 }, { provider_id: 'p2', model_id: 'quality', cost_per_1m: 5.0, quality: 0.9 }] });
  assert.equal(complex.simple, false);
  assert.equal(complex.model_id, 'quality');
});
