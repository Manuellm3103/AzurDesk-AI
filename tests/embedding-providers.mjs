import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerProvider,
  getProvider,
  listProviders,
  registerOpenAI,
  registerOllama
} from '../src/services/embeddingProviders.js';

test('built-in provider is registered by default', () => {
  const p = getProvider('builtin-256');
  assert.ok(p);
  assert.equal(p.dim, 256);
  assert.equal(p.cost_per_1k, 0);
});

test('built-in embed: returns 256-dim normalized vector', async () => {
  const p = getProvider('builtin-256');
  const { vector, dim } = await p.embed('hola mundo');
  assert.equal(dim, 256);
  assert.equal(vector.length, 256);
  // L2 norm should be 1 (normalized)
  let mag = 0;
  for (const v of vector) mag += v * v;
  assert.ok(Math.abs(Math.sqrt(mag) - 1) < 0.01);
});

test('built-in embed: same input → same vector (deterministic)', async () => {
  const p = getProvider('builtin-256');
  const a = await p.embed('test determinism');
  const b = await p.embed('test determinism');
  assert.deepEqual(a.vector, b.vector);
});

test('built-in embed: similar text → higher cosine than unrelated', async () => {
  const p = getProvider('builtin-256');
  const a = await p.embed('password reset email');
  const b = await p.embed('reset my email password');
  const c = await p.embed('banana ice cream recipe');
  const cos = (x, y) => {
    let s = 0, n = 0;
    for (let i = 0; i < x.length; i++) { s += x[i] * y[i]; n += x[i] * x[i]; }
    return s / (Math.sqrt(n) || 1);
  };
  const simSimilar = cos(a.vector, b.vector);
  const simUnrelated = cos(a.vector, c.vector);
  assert.ok(simSimilar > simUnrelated, `similar (${simSimilar}) should beat unrelated (${simUnrelated})`);
});

test('registerProvider: rejects malformed provider', () => {
  assert.throws(() => registerProvider({ id: 'bad' }), /must have/);
  assert.throws(() => registerProvider({}), /must have/);
});

test('registerOpenAI: requires apiKey', () => {
  assert.throws(() => registerOpenAI({ apiKey: null, model: 'text-embedding-3-small' }), /requires apiKey/);
});

test('registerOllama: registers provider without API call', () => {
  // Use a non-existent baseUrl but don't call embed; just register.
  const id = registerOllama({ baseUrl: 'http://localhost:99999', model: 'nomic-embed-text' });
  assert.equal(id, 'ollama:nomic-embed-text');
  const p = getProvider(id);
  assert.ok(p);
  assert.equal(p.dim, 768);
  assert.equal(p.cost_per_1k, 0);
});

test('listProviders: returns all registered ids', () => {
  const ids = listProviders();
  assert.ok(ids.includes('builtin-256'));
  assert.ok(Array.isArray(ids));
});
