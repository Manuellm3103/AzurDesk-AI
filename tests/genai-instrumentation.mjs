import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGenAIAttributes,
  enrichWithGenAI,
  startGenAISpan,
  finishGenAISpan
} from '../src/services/genaiInstrumentation.js';
import tracingService from '../src/services/agentTracingService.js';
import db from '../src/services/db.js';

test('buildGenAIAttributes: OTel canonical shape for ollama', () => {
  const attrs = buildGenAIAttributes({
    providerKind: 'ollama',
    modelId: 'llama3.1:8b',
    inputTokens: 12,
    outputTokens: 34,
    maxTokens: 2048,
    finishReason: 'stop',
    complexity: 'medium',
    latencyMs: 240
  });
  assert.equal(attrs['gen_ai.system'], 'ollama');
  assert.equal(attrs['gen_ai.request.model'], 'llama3.1:8b');
  assert.equal(attrs['gen_ai.usage.input_tokens'], 12);
  assert.equal(attrs['gen_ai.usage.output_tokens'], 34);
  assert.equal(attrs['gen_ai.request.max_tokens'], 2048);
  assert.equal(attrs['gen_ai.response.finish_reason'], 'stop');
  assert.equal(attrs['gen_ai.operation.name'], 'chat');
  assert.equal(attrs['gen_ai.complexity'], 'medium');
  assert.equal(attrs['gen_ai.latency_ms'], 240);
});

test('buildGenAIAttributes: maps provider kind to canonical system name', () => {
  assert.equal(buildGenAIAttributes({ providerKind: 'openai_compatible', modelId: 'x' })['gen_ai.system'], 'openai');
  assert.equal(buildGenAIAttributes({ providerKind: 'ollama_cloud', modelId: 'x' })['gen_ai.system'], 'ollama');
  assert.equal(buildGenAIAttributes({ providerKind: 'anthropic', modelId: 'x' })['gen_ai.system'], 'anthropic');
  assert.equal(buildGenAIAttributes({ providerKind: 'gemini', modelId: 'x' })['gen_ai.system'], 'gemini');
  assert.equal(buildGenAIAttributes({ providerKind: 'unknown_kind', modelId: 'x' })['gen_ai.system'], 'unknown_kind');
});

test('buildGenAIAttributes: omits optional fields when not finite', () => {
  const attrs = buildGenAIAttributes({ providerKind: 'ollama', modelId: 'm' });
  assert.equal(attrs['gen_ai.usage.input_tokens'], undefined);
  assert.equal(attrs['gen_ai.usage.output_tokens'], undefined);
  assert.equal(attrs['gen_ai.request.max_tokens'], undefined);
});

test('enrichWithGenAI: returns GenAI span id and OTel-compliant flag', () => {
  const span = { span_id: 'span-1', model_provider: 'ollama', model_name: 'llama3', complexity: 'medium' };
  const out = enrichWithGenAI(span, { success: true, input_tokens: 5, output_tokens: 10, latency_ms: 100 });
  assert.ok(out.gen_ai);
  assert.equal(out.gen_ai['gen_ai.system'], 'ollama');
  assert.match(out.gen_ai_span_id, /^genai-span-1$/);
  assert.equal(out.gen_ai_otel_compliant, true);
});

test('enrichWithGenAI: maps non-success to finish_reason=error', () => {
  const span = { span_id: 's', model_provider: 'anthropic', model_name: 'claude' };
  const out = enrichWithGenAI(span, { success: false, error: 'rate limit' });
  assert.equal(out.gen_ai['gen_ai.response.finish_reason'], 'error');
});

test('startGenAISpan + finishGenAISpan: round-trip persists GenAI attributes', () => {
  db.prepare('DELETE FROM agent_traces WHERE tenant_id = ?').run('tenant-genai-test');
  const span = startGenAISpan(tracingService, {
    tenantId: 'tenant-genai-test',
    operation: 'genai.chat',
    modelProvider: 'ollama',
    modelName: 'llama3.1:8b',
    complexity: 'medium'
  });
  assert.ok(span.span_id);

  finishGenAISpan(tracingService, span, {
    success: true,
    input_tokens: 100,
    output_tokens: 200,
    cost_usd: 0.001,
    latency_ms: 350,
    max_tokens: 2048,
    model_provider: 'ollama',
    model_id: 'llama3.1:8b'
  });

  const rows = db.prepare('SELECT attributes FROM agent_traces WHERE span_id = ?').all(span.span_id);
  assert.equal(rows.length, 1);
  const attrs = JSON.parse(rows[0].attributes);
  assert.equal(attrs.gen_ai_otel_compliant, true);
  assert.equal(attrs.gen_ai['gen_ai.system'], 'ollama');
  assert.equal(attrs.gen_ai['gen_ai.usage.input_tokens'], 100);
  assert.equal(attrs.gen_ai['gen_ai.usage.output_tokens'], 200);
  db.prepare('DELETE FROM agent_traces WHERE tenant_id = ?').run('tenant-genai-test');
});
