import test from 'node:test';
import assert from 'node:assert/strict';
import selfHealing from '../src/services/selfHealingService.js';

test('otel span start/end and trace retrieval', () => {
  const trace_id = 'trace-' + Date.now();
  const span = selfHealing.startSpan('t-otel', { trace_id, span_id: 'span-1', service: 'aaas-router', operation: 'generate' });
  assert.ok(span.id);
  selfHealing.endSpan(span.id, { status: 'error', meta: { reason: 'timeout' } });
  const trace = selfHealing.getTrace(trace_id);
  assert.equal(trace.length, 1);
  assert.equal(trace[0].status, 'error');
});

test('detect and heal maps failures to actions', () => {
  const span = selfHealing.startSpan('t-heal', { trace_id: 'trace-2', span_id: 'span-2', service: 'cua-agent', operation: 'act' });
  selfHealing.endSpan(span.id, { status: 'error' });
  const actions = selfHealing.detectAndHeal('t-heal');
  assert.ok(actions.some(a => a.action === 'retry_with_screenshot'));
});
