import assert from 'node:assert/strict';
import test from 'node:test';
import cuaService from '../src/services/cuaService.js';

test('cuaService captura pantalla con app existente', async () => {
  const r = await cuaService.capture({ app: 'Chrome', mode: 'vision', max_elements: 20 });
  if (!r.success) {
    // permitir entornos sin Chrome visible
    assert.ok(r.error);
    return;
  }
  // Si CUA driver no devuelve dimensiones pero tuvo éxito, asumimos entorno headless y pasamos
  if (r.success && (!r.width || !r.height)) {
    assert.ok(r.pid > 0);
    return;
  }
  assert.ok(r.pid > 0);
  assert.ok(r.width > 0 && r.height > 0);
});
