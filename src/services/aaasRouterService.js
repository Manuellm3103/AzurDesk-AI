import { fetch } from 'undici';
import db from './db.js';
import { now, safeJson, classifyComplexity } from './_utils.js';
import * as providerAccount from './providerAccountService.js';
import * as genai from './genaiInstrumentation.js';
import agentTracingService from './agentTracingService.js';

const GLOBAL_TIMEOUT = 30000;
const CIRCUIT_BREAK_MS = 60000;
const CIRCUIT_BREAK_THRESHOLD = 3;

const circuitBreakers = new Map();

function isOpen(providerId) {
  const cb = circuitBreakers.get(providerId);
  if (!cb) return false;
  if (Date.now() < cb.until) return true;
  // half-open: reset failures but keep tracked
  cb.failures = 0;
  cb.until = 0;
  return false;
}
function recordFailure(providerId) {
  const cb = circuitBreakers.get(providerId) || { failures: 0, until: 0 };
  cb.failures = (cb.failures || 0) + 1;
  if (cb.failures >= CIRCUIT_BREAK_THRESHOLD) {
    // exponential backoff: 60s, 120s, 240s...
    const backoff = CIRCUIT_BREAK_MS * Math.pow(2, Math.min(cb.failures - CIRCUIT_BREAK_THRESHOLD, 3));
    cb.until = Date.now() + backoff;
  }
  circuitBreakers.set(providerId, cb);
}
function recordSuccess(providerId) {
  circuitBreakers.delete(providerId);
}

// Mapeo de capacidades por kind. kind se almacena en la tabla llm_providers.
const KNOWN_PROVIDERS = {
  ollama: { auth: false, chatPath: '/api/chat', generatePath: '/api/generate', format: 'ollama' },
  ollama_cloud: { auth: true, chatPath: '/api/chat', generatePath: '/api/generate', format: 'ollama' },
  openai_compatible: { auth: true, chatPath: '/v1/chat/completions', generatePath: '/v1/completions', format: 'openai' },
  anthropic: { auth: true, chatPath: '/v1/messages', generatePath: null, format: 'anthropic' },
  gemini: { auth: true, chatPath: null, generatePath: null, format: 'gemini' },
  cohere: { auth: true, chatPath: '/v1/chat', generatePath: '/v1/generate', format: 'cohere' },
  groq: { auth: true, chatPath: '/openai/v1/chat/completions', generatePath: null, format: 'openai' },
  openrouter: { auth: true, chatPath: '/api/v1/chat/completions', generatePath: null, format: 'openai' }
};

// classifyComplexity imported from _utils.js

const MULTIMODAL_RE = /vision|vision-preview|4o|4o-mini|claude-3|gemini-pro-vision|llava|multimodal|gpt-4o|claude-3\.5|gemini-1\.5/i;

function modelSupportsMultimodal(modelId = '') {
  if (!modelId || typeof modelId !== 'string') return false;
  return MULTIMODAL_RE.test(modelId);
}

function buildCandidates(tenant_id, { complexity = 'medium', strategy = 'balanced', preferred, multimodal = false, maxCostPer1M }) {
  const providers = providerAccount.listProviders(tenant_id).filter((p) => p.enabled);
  const providerMap = new Map(providers.map((p) => [p.id, p]));
  const available = [];
  for (const p of providers) {
    if (isOpen(p.id)) continue;
    const models = p.models || [];
    for (const m of models) {
      const modelComplexity = m.complexity || 'medium';
      if (typeof modelComplexity === 'string' ? modelComplexity !== complexity : !modelComplexity.includes(complexity)) continue;
      if (multimodal && !modelSupportsMultimodal(m.id)) continue;
      if (maxCostPer1M != null && (m.cost_per_1m || 0) > maxCostPer1M) continue;
      available.push({ provider: p, model: m, provider_id: p.id, model_id: m.id, name: `${p.name}/${m.id}` });
    }
  }
  if (!available.length) {
    // fallback: ignore complexity and cost
    for (const p of providers) {
      if (isOpen(p.id)) continue;
      for (const m of p.models || []) {
        available.push({ provider: p, model: m, provider_id: p.id, model_id: m.id, name: `${p.name}/${m.id}` });
      }
    }
  }
  if (!available.length) return [];

  const scored = available.map((c) => {
    const q = c.model.quality || 0.7;
    const lat = c.model.latency_ms || 2000;
    const cost = c.model.cost_per_1m || 0;
    let score = q * 0.5 + (1 - Math.min(lat / 5000, 1)) * 0.3 + (1 - Math.min(cost / 5, 1)) * 0.2;
    if (strategy === 'cheap') score = 1 - Math.min(cost / 5, 1);
    if (strategy === 'fast') score = 1 - Math.min(lat / 5000, 1);
    if (strategy === 'quality') score = q;
    return { ...c, score };
  });

  if (preferred) {
    const preferredList = scored.filter((c) => c.provider.name === preferred || c.provider.kind === preferred || c.provider_id === preferred || c.name === preferred);
    if (preferredList.length) return preferredList.sort((a, b) => b.score - a.score);
  }
  return scored.sort((a, b) => b.score - a.score);
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function makeRequest(candidate, body, { stream = false, onChunk = null }) {
  const p = candidate.provider;
  const cfg = KNOWN_PROVIDERS[p.kind] || KNOWN_PROVIDERS.openai_compatible;
  const apiKey = providerAccount.getDecryptedKey(p.id, p.tenant_id);
  const path = stream && cfg.chatPath ? cfg.chatPath : (cfg.generatePath || cfg.chatPath || '/v1/chat/completions');
  const url = `${p.base_url.replace(/\/$/, '')}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.auth && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    if (p.kind === 'anthropic') headers['x-api-key'] = apiKey;
    if (p.kind === 'gemini') headers['x-goog-api-key'] = apiKey;
  }

  const payload = buildPayload(cfg.format, candidate.model_id, body, stream);
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
    if (!r.ok) throw new Error(`${p.kind} ${r.status}`);
    if (stream) {
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const text = extractDelta(cfg.format, parsed);
              if (text) {
                fullText += text;
                if (onChunk) onChunk(text);
              }
            } catch {}
          }
        }
      }
      return { text: fullText };
    }
    const j = await r.json();
    return { text: extractText(cfg.format, j) };
  } finally {
    clearTimeout(to);
  }
}

function buildPayload(format, modelId, { prompt, messages, system, temperature = 0.7, max_tokens = 2048, images = [] }, stream) {
  const normalized = normalizeMessages(messages || prompt);
  const hasMessages = Array.isArray(normalized) && normalized.length > 0;
  const lastUser = normalized.filter((m) => m.role === 'user').pop();
  const userContent = typeof lastUser?.content === 'string' ? lastUser.content : (typeof normalized.at(-1)?.content === 'string' ? normalized.at(-1).content : '');
  const multimodal = hasMedia(normalized) || images.length > 0;
  if (format === 'ollama') {
    const body = { model: modelId, stream: !!stream, options: { temperature } };
    if (hasMessages) {
      body.messages = [{ role: 'system', content: system || 'You are a helpful assistant.' }, ...normalized];
    } else {
      body.prompt = userContent;
    }
    return body;
  }
  if (format === 'anthropic') {
    return {
      model: modelId,
      max_tokens,
      temperature,
      system: system || 'You are a helpful assistant.',
      messages: hasMessages ? normalized : [{ role: 'user', content: multimodal ? buildImageContent(userContent, images) : userContent }]
    };
  }
  if (format === 'gemini') {
    return buildPayload('openai', modelId, { prompt, messages: normalized, system, temperature, max_tokens, images }, stream);
  }
  if (format === 'cohere') {
    return {
      model: modelId,
      message: userContent,
      preamble: system,
      temperature,
      stream: !!stream,
      connectors: []
    };
  }
  // openai compatible
  const out = {
    model: modelId,
    temperature,
    max_tokens,
    stream: !!stream
  };
  if (system) out.messages = [{ role: 'system', content: system }];
  if (hasMessages) {
    out.messages = [...(out.messages || []), ...normalized];
  } else {
    const content = multimodal ? buildImageContent(userContent, images) : userContent;
    out.messages = [...(out.messages || []), { role: 'user', content }];
  }
  return out;
}

function normalizeMessages(input) {
  if (!input) return [];
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (Array.isArray(input)) return input;
  if (input.messages) return input.messages;
  return [{ role: 'user', content: input.prompt || JSON.stringify(input) }];
}

function hasMedia(messages = []) {
  return messages.some((m) => {
    if (typeof m.content === 'string') return false;
    if (Array.isArray(m.content)) return m.content.some((p) => p.type === 'image_url' || p.type === 'image');
    return false;
  });
}

function buildImageContent(text, images) {
  if (!images.length) return text;
  const parts = [{ type: 'text', text }];
  for (const img of images) {
    parts.push({ type: 'image_url', image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` } });
  }
  return parts;
}

const TEXT_PATHS = {
  ollama: (j) => j.message?.content || j.response || '',
  anthropic: (j) => j.content?.map((c) => c.text).join('') || '',
  cohere: (j) => j.text || '',
  openai: (j) => j.choices?.[0]?.message?.content || j.choices?.[0]?.text || ''
};

const DELTA_PATHS = {
  ollama: (j) => j.message?.content || j.response || '',
  anthropic: (j) => j.delta?.text || '',
  cohere: (j) => j.text || '',
  openai: (j) => j.choices?.[0]?.delta?.content || ''
};

function extractText(format, json) {
  return (TEXT_PATHS[format] || TEXT_PATHS.openai)(json);
}

function extractDelta(format, json) {
  return (DELTA_PATHS[format] || DELTA_PATHS.openai)(json);
}

async function generate(tenant_id, body = {}, { fallback = true, stream = false, onChunk = null } = {}) {
  const start = Date.now();
  const messages = normalizeMessages(body.messages || body.prompt);
  const textQuery = messages.map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join(' ');
  const complexity = body.complexity || classifyComplexity(textQuery);
  // OTel GenAI: open span before candidate selection so observability captures
  // the full latency, including provider routing.
  const traceSpan = genai.startGenAISpan(agentTracingService, {
    traceId: body.trace_id,
    tenantId: tenant_id,
    operation: 'genai.chat',
    complexity
  });
  const candidates = buildCandidates(tenant_id, {
    complexity,
    strategy: body.strategy || 'balanced',
    preferred: body.preferred,
    multimodal: body.multimodal || hasMedia(messages) || (body.images?.length > 0),
    maxCostPer1M: body.maxCostPer1M
  });
  if (!candidates.length) {
    return { success: false, error: 'No hay proveedores LLM configurados o disponibles' };
  }
  const maxAttempts = fallback ? Math.min(candidates.length, 3) : 1;
  let lastError;
  let candidate;
  let text = '';
  const requestBody = { ...body, messages };
  for (let i = 0; i < maxAttempts; i++) {
    candidate = candidates[i];
    try {
      const result = await makeRequest(candidate, requestBody, { stream, onChunk });
      text = result.text;
      recordSuccess(candidate.provider_id);
      break;
    } catch (e) {
      lastError = e.message;
      recordFailure(candidate.provider_id);
    }
  }
  const latency_ms = Date.now() - start;
  const success = !!text;
  const inputTokens = estimateTokens(JSON.stringify(requestBody));
  const outputTokens = estimateTokens(text);
  const cost = candidate ? (candidate.model.cost_per_1m || 0) * ((inputTokens + outputTokens) / 1_000_000) : 0;
  providerAccount.logUsage({
    tenant_id,
    provider_id: candidate?.provider_id || 'unknown',
    model: candidate?.model_id || 'unknown',
    operation: 'generate',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    latency_ms,
    success,
    error: success ? null : lastError
  });
  if (success) {
    // OTel GenAI: enrich span with canonical attributes (system, model, tokens, cost, finish_reason)
    genai.finishGenAISpan(agentTracingService, traceSpan, {
      success: true,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
      latency_ms,
      max_tokens: requestBody.max_tokens,
      model_provider: candidate.provider.kind,
      model_id: candidate.model_id,
      finish_reason: 'stop'
    });
    return {
      success: true,
      provider: candidate.provider.name,
      provider_id: candidate.provider_id,
      model: candidate.model_id,
      complexity,
      text,
      latency_ms,
      cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
      trace_span_id: traceSpan.span_id
    };
  }
  // OTel GenAI: record failure
  genai.finishGenAISpan(agentTracingService, traceSpan, {
    success: false,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: 0,
    latency_ms,
    max_tokens: requestBody.max_tokens,
    model_provider: candidate?.provider?.kind,
    model_id: candidate?.model_id,
    finish_reason: 'error'
  });
  return { success: false, error: lastError, fallback_used: fallback, trace_span_id: traceSpan.span_id };
}

function listAvailableModels(tenant_id) {
  const providers = providerAccount.listProviders(tenant_id).filter((p) => p.enabled);
  const out = [];
  for (const p of providers) {
    for (const m of p.models || []) {
      out.push({ provider_id: p.id, provider_name: p.name, kind: p.kind, model_id: m.id, quality: m.quality, cost_per_1m: m.cost_per_1m, latency_ms: m.latency_ms, capabilities: m.capabilities || [] });
    }
  }
  return out;
}

export { generate, listAvailableModels, classifyComplexity, buildCandidates, estimateTokens };
export default { generate, listAvailableModels, classifyComplexity, buildCandidates, estimateTokens };
