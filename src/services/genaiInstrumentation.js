// OpenTelemetry GenAI Semantic Conventions instrumentation (2025 W3C draft).
// Emits standardized span attributes for LLM calls per the OTel GenAI spec:
//   - gen_ai.system                : provider name (e.g. openai, anthropic, ollama)
//   - gen_ai.request.model         : model id
//   - gen_ai.request.max_tokens    : max_tokens requested
//   - gen_ai.usage.input_tokens    : tokens in
//   - gen_ai.usage.output_tokens   : tokens out
//   - gen_ai.response.finish_reason: stop, length, content_filter, etc.
//   - gen_ai.operation.name        : chat, generate, embed
//
// Wraps agentTracingService so existing UI/audit keep working; adds a
// parallel payload of canonical attributes that any OTel collector can
// parse and forward to observability backends (Honeycomb, Datadog, Tempo).
//
// Reference: https://opentelemetry.io/docs/specs/semconv/gen-ai/

import { randomUUID } from 'crypto';

const KNOWN_SYSTEMS = {
  ollama: 'ollama',
  ollama_cloud: 'ollama',
  openai_compatible: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  cohere: 'cohere',
  groq: 'groq',
  openrouter: 'openai'
};

function toGenAISystem(providerKind) {
  return KNOWN_SYSTEMS[providerKind] || providerKind || 'unknown';
}

/**
 * Build the canonical OTel GenAI attribute set for an LLM call.
 * Pure function — no side effects, no DB, no IO. Testable in isolation.
 */
export function buildGenAIAttributes({
  providerKind, modelId, inputTokens, outputTokens,
  maxTokens, finishReason, complexity, latencyMs
}) {
  const attrs = {
    'gen_ai.system': toGenAISystem(providerKind),
    'gen_ai.request.model': String(modelId || 'unknown'),
    'gen_ai.operation.name': 'chat'
  };
  if (Number.isFinite(inputTokens)) attrs['gen_ai.usage.input_tokens'] = inputTokens;
  if (Number.isFinite(outputTokens)) attrs['gen_ai.usage.output_tokens'] = outputTokens;
  if (Number.isFinite(maxTokens) && maxTokens > 0) attrs['gen_ai.request.max_tokens'] = maxTokens;
  if (finishReason) attrs['gen_ai.response.finish_reason'] = finishReason;
  if (complexity) attrs['gen_ai.complexity'] = complexity;
  if (Number.isFinite(latencyMs)) attrs['gen_ai.latency_ms'] = latencyMs;
  return attrs;
}

/**
 * Wraps an existing agent trace span with the OTel GenAI attribute set
 * and a stable gen_ai.span_id correlator. Returns the enrichment payload
 * the caller should merge into agent_traces.metadata (JSON column).
 */
export function enrichWithGenAI(existingSpan, llmResult, requestContext) {
  const attrs = buildGenAIAttributes({
    providerKind: existingSpan.model_provider,
    modelId: existingSpan.model_name,
    inputTokens: llmResult.input_tokens,
    outputTokens: llmResult.output_tokens,
    maxTokens: requestContext?.max_tokens,
    finishReason: llmResult.finish_reason || (llmResult.success ? 'stop' : 'error'),
    complexity: existingSpan.complexity,
    latencyMs: llmResult.latency_ms
  });
  return {
    gen_ai: attrs,
    gen_ai_span_id: `genai-${existingSpan.span_id || randomUUID()}`,
    gen_ai_otel_compliant: true
  };
}

/**
 * Convenience: start a GenAI-instrumented span around an LLM call. Returns
 * a context object the caller passes to finishGenAISpan() at the end.
 * Uses agentTracingService.startSpan under the hood (existing infra).
 */
export function startGenAISpan(tracingService, { traceId, tenantId, agentId, operation, modelProvider, modelName, complexity, metadata }) {
  const span = tracingService.startSpan({
    trace_id: traceId || randomUUID(),
    tenant_id: tenantId,
    agent_id: agentId || null,
    operation: operation || 'genai.chat',
    model_provider: modelProvider || null,
    model_name: modelName || null,
    complexity: complexity || null,
    attributes: { ...(metadata || {}), gen_ai: { 'gen_ai.operation.name': operation || 'genai.chat' } }
  });
  return span;
}

/**
 * Finish a GenAI span: merges OTel attributes, sets latency, marks success.
 * Idempotent: re-calling with the same span updates in place.
 */
export function finishGenAISpan(tracingService, span, llmResult) {
  // startSpan() returns only {span_id, start_time}; full model_provider/model_name
  // live in the DB. We can read them back via getSpanById, but the caller may also
  // pass them through llmResult. Prefer llmResult when present.
  const spanFull = (tracingService.getSpanById && tracingService.getSpanById(span.span_id)) || span;
  const enriched = enrichWithGenAI({
    span_id: span.span_id,
    model_provider: llmResult.model_provider || spanFull.model_provider,
    model_name: llmResult.model_id || spanFull.model_name,
    complexity: spanFull.complexity
  }, llmResult, { max_tokens: llmResult.max_tokens });
  // endSpan(span_id, {output, status, attributes}) only persists these 3 + latency_ms.
  // Tokens/cost/finish_reason go in attributes (merged with prior GenAI attrs from startSpan).
  const finalAttrs = {
    ...(span.attributes || {}),
    ...enriched,
    'gen_ai.usage.input_tokens': llmResult.input_tokens || 0,
    'gen_ai.usage.output_tokens': llmResult.output_tokens || 0,
    'gen_ai.cost_usd': llmResult.cost_usd || 0
  };
  tracingService.endSpan(span.span_id, {
    status: llmResult.success ? 'completed' : 'error',
    attributes: finalAttrs
  });
  return finalAttrs;
}
