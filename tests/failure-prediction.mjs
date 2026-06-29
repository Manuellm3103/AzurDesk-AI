import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import failurePredictionService from '../src/services/failurePredictionService.js';

const TENANT = 'tenant-failure-test';

describe('failurePredictionService', () => {
  it('recordSignal guarda señal', () => {
    const s = failurePredictionService.recordSignal(TENANT, { signal_type: 'error_rate', entity_type: 'service', entity_id: 'svc-1', value: 0.8, threshold: 0.7 });
    assert.equal(s.signal_type, 'error_rate');
    assert.equal(s.entity_id, 'svc-1');
    const list = failurePredictionService.listSignals(TENANT, { signal_type: 'error_rate' });
    assert.ok(list.some(x => x.id === s.id));
  });

  it('predict devuelve score y recomendación', () => {
    const p = failurePredictionService.predict(TENANT, 'service', 'svc-2', [
      { signal_type: 'error_rate', value: 0.9, threshold: 0.7 },
      { signal_type: 'latency_p95', value: 1.2, threshold: 1.0 },
      { signal_type: 'open_tickets', value: 0.4, threshold: 1 }
    ]);
    assert.ok(p.risk_score >= 0);
    assert.ok(p.risk_score <= 1);
    assert.ok(['low','medium','high','critical'].includes(p.status));
    assert.ok(p.recommended_action);
    assert.ok(p.confidence > 0);
  });

  it('status crítico con señales altas', () => {
    const p = failurePredictionService.predict(TENANT, 'service', 'svc-3', [
      { signal_type: 'error_rate', value: 5, threshold: 1 },
      { signal_type: 'latency_p95', value: 5, threshold: 1 },
      { signal_type: 'open_tickets', value: 60, threshold: 50 },
      { signal_type: 'overdue_ratio', value: 0.5, threshold: 0.25 },
      { signal_type: 'sentiment_negative', value: 0.9, threshold: 0.7 }
    ]);
    assert.equal(p.status, 'critical');
    assert.equal(p.recommended_action, 'remediar_automatico');
  });

  it('listPredictions filtra por status', () => {
    failurePredictionService.predict(TENANT, 'service', 'svc-4', [{ signal_type: 'error_rate', value: 0.1, threshold: 1 }]);
    failurePredictionService.predict(TENANT, 'service', 'svc-5', [{ signal_type: 'error_rate', value: 5, threshold: 1 }]);
    const critical = failurePredictionService.listPredictions(TENANT, { status: 'critical' });
    assert.ok(critical.some(p => p.entity_id === 'svc-5'));
  });

  it('getPrediction obtiene detalle', () => {
    const p = failurePredictionService.predict(TENANT, 'service', 'svc-6', [{ signal_type: 'error_rate', value: 5, threshold: 1 }]);
    const g = failurePredictionService.getPrediction(TENANT, p.id);
    assert.equal(g.id, p.id);
    assert.ok(Array.isArray(g.signals));
  });

  it('updatePrediction cambia status', () => {
    const p = failurePredictionService.predict(TENANT, 'service', 'svc-7', [{ signal_type: 'error_rate', value: 5, threshold: 1 }]);
    const ok = failurePredictionService.updatePrediction(TENANT, p.id, { status: 'resolved' });
    assert.equal(ok, true);
    const g = failurePredictionService.getPrediction(TENANT, p.id);
    assert.equal(g.status, 'resolved');
  });

  it('scanTenant genera predicción para tenant', () => {
    const p = failurePredictionService.scanTenant(TENANT);
    assert.ok(p.id);
    assert.equal(p.entity_type, 'tenant');
    assert.equal(p.entity_id, TENANT);
  });
});
