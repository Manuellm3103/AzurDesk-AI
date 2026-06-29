import { fetch } from 'undici';
import db from './db.js';
import { now, classifyComplexity } from './_utils.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OPENAI_API_KEY=process.env.OPENAI_API_KEY || '';

const MODELS = [
  {
    name: 'ollama-ministral',
    provider: 'ollama',
    endpoint: `${OLLAMA_HOST}/api/generate`,
    model: 'ministral-3:8b-cloud',
    complexity: ['low', 'medium'],
    costPer1M: 0,
    latencyMs: 2000,
    quality: 0.7,
    priority: 1
  },
  {
    name: 'ollama-llama3',
    provider: 'ollama',
    endpoint: `${OLLAMA_HOST}/api/generate`,
    model: 'llama3:8b',
    complexity: ['low', 'medium', 'high'],
    costPer1M: 0,
    latencyMs: 3000,
    quality: 0.75,
    priority: 2
  },
  {
    name: 'openai-gpt4o-mini',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    complexity: ['low', 'medium'],
    costPer1M: 0.15,
    latencyMs: 800,
    quality: 0.85,
    priority: 3
  },
  {
    name: 'openai-gpt4o',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    complexity: ['medium', 'high'],
    costPer1M: 2.5,
    latencyMs: 1500,
    quality: 0.95,
    priority: 4
  }
];

const circuitBreakers = new Map();

function isOpen(provider) {
  const cb = circuitBreakers.get(provider);
  if (!cb) return false;
  if (Date.now() < cb.until) return true;
  circuitBreakers.delete(provider);
  return false;
}

function trip(provider) {
  circuitBreakers.set(provider, { until: Date.now() + 60000 });
}

// classifyComplexity imported from _utils.js

function estimateCost(model, prompt) {
  const tokens = Math.ceil(prompt.length / 4);
  return (tokens / 1_000_000) * model.costPer1M;
}

function routeModel({ complexity, preferred, strategy = 'balanced', maxCostPer1M } = {}) {
  const comp = complexity || classifyComplexity();
  let pool = MODELS.filter((m) => m.complexity.includes(comp));
  if (preferred) pool = pool.filter((m) => m.name === preferred || m.provider === preferred);
  if (maxCostPer1M != null) pool = pool.filter((m) => m.costPer1M <= maxCostPer1M);
  pool = pool.filter((m) => !isOpen(m.provider));
  if (!pool.length) pool = MODELS.filter((m) => !isOpen(m.provider));
  if (!pool.length) return MODELS[0];

  if (strategy === 'cheap') return pool.sort((a, b) => a.costPer1M - b.costPer1M)[0];
  if (strategy === 'fast') return pool.sort((a, b) => a.latencyMs - b.latencyMs)[0];
  if (strategy === 'quality') return pool.sort((a, b) => b.quality - a.quality)[0];
  return pool.map((m) => ({
    ...m,
    score: m.quality * 0.5 + (1 - Math.min(m.latencyMs / 5000, 1)) * 0.3 + (1 - Math.min(m.costPer1M / 5, 1)) * 0.2
  })).sort((a, b) => b.score - a.score)[0];
}

function listModels() {
  return MODELS.map((m) => ({ name: m.name, provider: m.provider, model: m.model, complexity: m.complexity, costPer1M: m.costPer1M, latencyMs: m.latencyMs, quality: m.quality, available: !isOpen(m.provider) }));
}

async function callOllama(model, prompt) {
  const r = await fetch(model.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model.model, prompt, stream: false })
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const j = await r.json();
  return j.response || '';
}

async function callOpenAI(model, prompt) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
  const headers = { 'Content-Type': 'application/json' };
  headers.Authorization = 'Bearer ' + OPENAI_API_KEY;
  const r = await fetch(model.endpoint, { method: 'POST', headers, body: JSON.stringify({ model: model.model, messages: [{ role: 'user', content: prompt }] }) });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

async function generate(prompt, { complexity, preferred, strategy = 'balanced', maxCostPer1M, fallback = true, tenant_id = 'default' } = {}) {
  const start = Date.now();
  const comp = complexity || classifyComplexity(prompt);
  let model = routeModel({ complexity: comp, preferred, strategy, maxCostPer1M });
  let lastError;
  let text = '';
  let success = false;
  for (let attempt = 0; attempt < (fallback ? 3 : 1); attempt++) {
    try {
      if (model.provider === 'ollama') text = await callOllama(model, prompt);
      else if (model.provider === 'openai') text = await callOpenAI(model, prompt);
      success = true;
      break;
    } catch (e) {
      lastError = e.message;
      trip(model.provider);
      if (!fallback) break;
      model = routeModel({ complexity: comp, strategy, maxCostPer1M });
    }
  }
  const latency_ms = Date.now() - start;
  const cost_estimate = estimateCost(model, prompt);
  db.prepare('INSERT INTO llm_routes (tenant_id, request_type, complexity, model, latency_ms, cost_estimate, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tenant_id, preferred || 'auto', comp, model.name, latency_ms, cost_estimate, success ? 1 : 0, now());
  if (success) return { success: true, model: model.name, provider: model.provider, complexity: comp, text, latency_ms, cost_estimate };
  return { success: false, error: lastError, fallback_used: fallback };
}

function routingStats(tenant_id) {
  const total = db.prepare('SELECT COUNT(*) as c FROM llm_routes WHERE tenant_id = ?').get(tenant_id).c;
  const success = db.prepare('SELECT COUNT(*) as c FROM llm_routes WHERE tenant_id = ? AND success = 1').get(tenant_id).c;
  const avgLatency = db.prepare('SELECT AVG(latency_ms) as v FROM llm_routes WHERE tenant_id = ?').get(tenant_id).v || 0;
  const totalCost = db.prepare('SELECT SUM(cost_estimate) as v FROM llm_routes WHERE tenant_id = ?').get(tenant_id).v || 0;
  return { total, success, avg_latency_ms: Math.round(avgLatency), total_cost_estimate: totalCost, success_rate: total ? Math.round((success/total)*1000)/10 : 0 };
}

export { generate, listModels, routeModel, classifyComplexity, routingStats };
