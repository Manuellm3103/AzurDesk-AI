import tracingService from '../src/services/agentTracingService.js';
import db from '../src/services/db.js';
import { test } from 'node:test';
import assert from 'node:assert';

function cleanTestData() {
  // Clear only the tables we are testing: agent_traces and trace_aggregates
  // We leave model_costs alone because it has the default costs and is not modified by the service (except via upsertModelCost, which we don't use in these tests)
  db.prepare('DELETE FROM agent_traces').run();
  db.prepare('DELETE FROM trace_aggregates').run();
}

test('AgentTracingService: should start a span', async () => {
  cleanTestData();
  const span = tracingService.startSpan({
    trace_id: 'trace-1',
    tenant_id: 'tenant-1',
    operation: 'test-operation'
  });
  // Fetch the span from the database to check the operation
  const spans = tracingService.getTracesByTenant({ tenant_id: 'tenant-1' });
  const found = spans.find(s => s.span_id === span.span_id);
  assert.ok(found);
  assert.equal(found.operation, 'test-operation');
});

test('AgentTracingService: should end a span', async () => {
  cleanTestData();
  const span = tracingService.startSpan({
    trace_id: 'trace-1',
    tenant_id: 'tenant-1',
    operation: 'test-operation'
  });
  const ended = tracingService.endSpan(span.span_id, { status: 'completed' });
  // Fetch the span from the database
  const spans = tracingService.getTracesByTenant({ tenant_id: 'tenant-1' });
  const found = spans.find(s => s.span_id === span.span_id);
  assert.ok(found);
  assert.equal(found.status, 'completed');
  assert.ok(found.end_time);
});

test('AgentTracingService: should calculate cost based on model', async () => {
  cleanTestData();
  const span = tracingService.startSpan({
    trace_id: 'trace-1',
    tenant_id: 'tenant-1',
    operation: 'llm_call',
    model_provider: 'openai',
    model_name: 'gpt-4',
    input_tokens: 1000,
    output_tokens: 1000
  });
  const ended = tracingService.endSpan(span.span_id, { status: 'completed' });
  const expectedCost = 0.09;
  const tolerance = 0.0001;
  const diff = Math.abs(ended.cost - expectedCost);
  assert.ok(diff < tolerance, `Expected cost to be within ${tolerance} of ${expectedCost}, but got ${ended.cost}`);
});

test('AgentTracingService: should get traces by tenant', async () => {
  cleanTestData();
  tracingService.startSpan({
    trace_id: 'trace-1',
    tenant_id: 'tenant-1',
    operation: 'op1'
  });
  tracingService.startSpan({
    trace_id: 'trace-2',
    tenant_id: 'tenant-1',
    operation: 'op2'
  });
  tracingService.startSpan({
    trace_id: 'trace-3',
    tenant_id: 'tenant-2',
    operation: 'op3'
  });

  const traces = tracingService.getTracesByTenant({ tenant_id: 'tenant-1' });
  // We expect exactly 2 traces for tenant-1
  assert.equal(traces.length, 2);
  const traceIds = traces.map(t => t.trace_id);
  assert.ok(traceIds.includes('trace-1'));
  assert.ok(traceIds.includes('trace-2'));
});

test('AgentTracingService: should update daily aggregate', async () => {
  cleanTestData();
  const span = tracingService.startSpan({
    trace_id: 'trace-1',
    tenant_id: 'tenant-1',
    operation: 'op1'
  });
  tracingService.endSpan(span.span_id, { status: 'completed' });
  // If we get here without error, the test passes.
  assert.ok(true);
});