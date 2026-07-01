// Embedding Provider Factory — pluggable embedding backends (2026 upgrade path).
// Built-in 'builtin-256' is the default. External providers (OpenAI, Ollama)
// can be selected via env var EMBEDDING_PROVIDER or per-call override.
//
// Real-world upgrade: drop in OpenAIProvider or OllamaProvider by
// implementing { id, modelId, dim, embed(text) } and registering it.

import { fetch } from 'undici';
import { createHash } from 'crypto';

const DEFAULT_PROVIDER_ID = process.env.EMBEDDING_PROVIDER || 'builtin-256';

const providers = new Map();

function pseudoEmbed(text, dim) {
  // Local BMF-style embedding (matches existing embeddingService.js shape).
  const v = new Float32Array(dim);
  const tokens = String(text || '').toLowerCase().replace(/[^a-z0-9áéíóúñü\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
  for (const tok of tokens) {
    const h = createHash('sha256').update(tok).digest();
    const pos = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
    const idx = pos % dim;
    v[idx] = (v[idx] || 0) + 1.0;
  }
  let mag = 0;
  for (let i = 0; i < dim; i++) mag += v[i] * v[i];
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < dim; i++) v[i] /= mag;
  return Array.from(v);
}

export function registerProvider(provider) {
  if (!provider || !provider.id || typeof provider.embed !== 'function') {
    throw new Error('Provider must have {id, embed(text)}');
  }
  providers.set(provider.id, provider);
}

export function getProvider(id = DEFAULT_PROVIDER_ID) {
  return providers.get(id) || null;
}

export function listProviders() {
  return Array.from(providers.keys());
}

export function setDefaultProvider(id) {
  if (!providers.has(id)) throw new Error(`Unknown provider: ${id}`);
  return id;
}

// --- Built-in provider (always registered) ---
registerProvider({
  id: 'builtin-256',
  modelId: 'builtin-256',
  dim: 256,
  cost_per_1k: 0,
  async embed(text) {
    return { vector: pseudoEmbed(text, 256), dim: 256, model: 'builtin-256' };
  }
});

// --- OpenAI provider (lazy: only created when OPENAI_API_KEY is set) ---
export function registerOpenAI({ apiKey = process.env.OPENAI_API_KEY, model = 'text-embedding-3-small', baseUrl = 'https://api.openai.com' } = {}) {
  if (!apiKey) throw new Error('OpenAI provider requires apiKey (or OPENAI_API_KEY env)');
  const DIM_BY_MODEL = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536
  };
  const dim = DIM_BY_MODEL[model] || 1536;
  registerProvider({
    id: `openai:${model}`,
    modelId: model,
    dim,
    cost_per_1k: model.includes('large') ? 0.00013 : 0.00002,
    async embed(text) {
      const r = await fetch(`${baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, model })
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`OpenAI embed ${r.status}: ${body.slice(0, 200)}`);
      }
      const json = await r.json();
      const vec = json.data?.[0]?.embedding;
      if (!vec) throw new Error('OpenAI embed: no vector in response');
      return { vector: vec, dim: vec.length, model };
    }
  });
  return `openai:${model}`;
}

// --- Ollama provider (local) ---
export function registerOllama({ baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434', model = 'nomic-embed-text' } = {}) {
  const DIM_BY_MODEL = {
    'nomic-embed-text': 768,
    'mxbai-embed-large': 1024,
    'all-minilm': 384
  };
  const dim = DIM_BY_MODEL[model] || 768;
  registerProvider({
    id: `ollama:${model}`,
    modelId: model,
    dim,
    cost_per_1k: 0,
    async embed(text) {
      const r = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text })
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Ollama embed ${r.status}: ${body.slice(0, 200)}`);
      }
      const json = await r.json();
      const vec = json.embedding;
      if (!vec) throw new Error('Ollama embed: no embedding in response');
      return { vector: vec, dim: vec.length, model };
    }
  });
  return `ollama:${model}`;
}

// --- Auto-register from env if keys present ---
if (process.env.OPENAI_API_KEY) {
  try { registerOpenAI(); } catch (_) { /* ignore */ }
}
if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_ENABLED === '1') {
  try { registerOllama(); } catch (_) { /* ignore */ }
}
