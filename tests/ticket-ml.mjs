import test from 'node:test';
import assert from 'node:assert/strict';
import * as ticketML from '../src/ml/ticketML.js';

test('predice categoría de ticket', () => {
  const model = ticketML.trainClassifier([
    { text: 'forgot my password', label: 1 },
    { text: 'cannot login to vpn', label: 1 },
    { text: 'printer is not printing', label: 1 },
    { text: 'need access to folder', label: 1 }
  ]);
  const r = ticketML.predict(model, 'I forgot my password and cannot login');
  assert.ok(['password-reset','vpn','printer','other'].includes(r.predicted));
  assert.ok(r.score >= 0);
});
