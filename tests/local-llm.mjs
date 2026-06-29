import test from 'node:test';
import assert from 'node:assert/strict';
import localRouter from '../src/services/localLLMRouterService.js';

test('register and route local LLM', () => {
  localRouter.register('t-local', { name: 'qwen2.5-coder', backend: 'llama.cpp', path: 'models/qwen.gguf', context_size: 8192, priority: 1 });
  localRouter.register('t-local', { name: 'vision-model', backend: 'onnx', path: 'models/vision.onnx', context_size: 4096, multimodal: true, priority: 2 });
  const simple = localRouter.route('t-local', { text: 'hola' });
  assert.ok(simple.local);
  const vision = localRouter.route('t-local', { text: 'describe image', images: ['data:image/png;base64,abc'] });
  assert.equal(vision.local.name, 'vision-model');
});

test('no local models returns reason', () => {
  const r = localRouter.route('t-empty', { text: 'x' });
  assert.equal(r.local, null);
});
