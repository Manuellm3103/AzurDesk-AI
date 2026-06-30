import { test } from 'node:test';
import assert from 'node:assert/strict';
import promptCache from '../src/services/promptCacheService.js';

test('promptCache.set and get hit on identical prompt', () => {
  const tenant = 't-cache-1-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  // Clean up any prior data for this tenant to guarantee miss
  promptCache.invalidate(tenant, { modelProvider: 'anthropic', modelName: 'claude-3-haiku' });
  const prompt = '¿Cuál es el SLA del ticket #123?';
  // First call: miss
  const miss = promptCache.get(tenant, { modelProvider: 'anthropic', modelName: 'claude-3-haiku', prompt });
  assert.equal(miss.hit, false);
  // Store
  promptCache.set(tenant, {
    modelProvider: 'anthropic',
    modelName: 'claude-3-haiku',
    prompt,
    response: { text: 'El SLA es 4h' },
    inputTokens: 12,
    outputTokens: 5,
    cost: 0.0001
  });
  // Second call: hit
  const hit = promptCache.get(tenant, { modelProvider: 'anthropic', modelName: 'claude-3-haiku', prompt });
  assert.equal(hit.hit, true);
  assert.equal(hit.response.text, 'El SLA es 4h');
  assert.equal(hit.input_tokens, 12);
});

test('promptCache normalizes whitespace so trivial differences still hit', () => {
  const tenant = 't-cache-2-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  promptCache.invalidate(tenant, { modelProvider: 'openai', modelName: 'gpt-4o-mini' });
  promptCache.set(tenant, {
    modelProvider: 'openai', modelName: 'gpt-4o-mini',
    prompt: 'hola mundo',
    response: { text: 'hi' }, inputTokens: 1, outputTokens: 1, cost: 0
  });
  const hit = promptCache.get(tenant, {
    modelProvider: 'openai', modelName: 'gpt-4o-mini',
    prompt: '  hola   mundo  \n'
  });
  assert.equal(hit.hit, true);
});

test('promptCache.invalidate removes entries by provider', () => {
  const tenant = 't-cache-3-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  promptCache.invalidate(tenant, { modelProvider: 'p1', modelName: 'm1' });
  promptCache.invalidate(tenant, { modelProvider: 'p2', modelName: 'm2' });
  promptCache.set(tenant, { modelProvider: 'p1', modelName: 'm1', prompt: 'a', response: { text: 'A' }, inputTokens: 1, outputTokens: 1, cost: 0 });
  promptCache.set(tenant, { modelProvider: 'p2', modelName: 'm2', prompt: 'b', response: { text: 'B' }, inputTokens: 1, outputTokens: 1, cost: 0 });
  const removed = promptCache.invalidate(tenant, { modelProvider: 'p1', modelName: 'm1' });
  assert.ok(removed >= 1);
  assert.equal(promptCache.get(tenant, { modelProvider: 'p1', modelName: 'm1', prompt: 'a' }).hit, false);
  assert.equal(promptCache.get(tenant, { modelProvider: 'p2', modelName: 'm2', prompt: 'b' }).hit, true);
});

test('promptCache.stats counts hits and misses', () => {
  const tenant = 't-cache-4-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  promptCache.invalidate(tenant, { modelProvider: 'x', modelName: 'y' });
  // 1 miss + 1 set + 1 hit
  promptCache.get(tenant, { modelProvider: 'x', modelName: 'y', prompt: 'q1' });
  promptCache.set(tenant, { modelProvider: 'x', modelName: 'y', prompt: 'q1', response: { text: 'A' }, inputTokens: 5, outputTokens: 3, cost: 0.001 });
  promptCache.get(tenant, { modelProvider: 'x', modelName: 'y', prompt: 'q1' });
  const stats = promptCache.stats(tenant, { days: 1 });
  assert.ok(stats.length >= 1);
  const day = stats[stats.length - 1];
  assert.ok(day.hits >= 1);
  assert.ok(day.misses >= 1);
  assert.ok(day.tokens_saved >= 5);
  assert.ok(day.cost_saved >= 0.001);
});

test('promptCache.cleanup removes expired entries', () => {
  const tenant = 't-cache-5-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  promptCache.invalidate(tenant, { modelProvider: 'p', modelName: 'm' });
  promptCache.set(tenant, {
    modelProvider: 'p', modelName: 'm', prompt: 'exp',
    response: { text: 'x' }, inputTokens: 1, outputTokens: 1, cost: 0,
    ttlSeconds: 1
  });
  // Wait > TTL
  const start = Date.now();
  while (Date.now() - start < 1100) { /* spin */ }
  const removed = promptCache.cleanup();
  assert.ok(removed >= 1);
});
