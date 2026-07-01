import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProtocolVersion,
  wrapStructuredResult,
  buildRootsList,
  buildTaskDescriptor,
  buildCompletionResponse,
  buildHardenedCapabilities,
  SUPPORTED_PROTOCOL_VERSIONS
} from '../src/services/mcp10Hardening.js';

test('validateProtocolVersion: default when header missing', () => {
  const v = validateProtocolVersion();
  assert.equal(v, '2025-11-25');
});

test('validateProtocolVersion: accepts current version', () => {
  assert.equal(validateProtocolVersion('2025-11-25'), '2025-11-25');
});

test('validateProtocolVersion: accepts legacy version', () => {
  assert.equal(validateProtocolVersion('2025-06-01'), '2025-06-01');
});

test('validateProtocolVersion: rejects unknown version with code', () => {
  try {
    validateProtocolVersion('2099-01-01');
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(e.code, 'UNSUPPORTED_PROTOCOL_VERSION');
    assert.ok(Array.isArray(e.supported));
    assert.ok(e.supported.length >= 1);
  }
});

test('wrapStructuredResult: adds structuredContent and isError when provided', () => {
  const r = wrapStructuredResult({
    content: [{ type: 'text', text: 'ok' }],
    structured: { status: 'ok', count: 3 },
    isError: false
  });
  assert.deepEqual(r.content, [{ type: 'text', text: 'ok' }]);
  assert.deepEqual(r.structuredContent, { status: 'ok', count: 3 });
  assert.equal(r.isError, undefined);
});

test('wrapStructuredResult: omits fields when not provided', () => {
  const r = wrapStructuredResult({ content: [] });
  assert.deepEqual(r.content, []);
  assert.equal(r.structuredContent, undefined);
  assert.equal(r.isError, undefined);
});

test('buildRootsList: includes tenant URI', () => {
  const out = buildRootsList('tenant-x');
  assert.equal(out.roots.length, 1);
  assert.equal(out.roots[0].uri, 'azurdesk://tenant-x/');
  assert.match(out.roots[0].name, /tenant-x/);
});

test('buildTaskDescriptor: requires valid status', () => {
  assert.throws(() => buildTaskDescriptor({ id: 't1', status: 'weird' }));
  const p = buildTaskDescriptor({ id: 't1', status: 'pending' });
  assert.equal(p.id, 't1');
  assert.equal(p.status, 'pending');
});

test('buildTaskDescriptor: clamps progress to [0,1]', () => {
  const a = buildTaskDescriptor({ id: 'a', status: 'pending', progress: -0.5 });
  assert.equal(a.progress, 0);
  const b = buildTaskDescriptor({ id: 'b', status: 'pending', progress: 1.5 });
  assert.equal(b.progress, 1);
  const c = buildTaskDescriptor({ id: 'c', status: 'pending', progress: 0.42 });
  assert.equal(c.progress, 0.42);
});

test('buildCompletionResponse: wraps with completion object', () => {
  const r = buildCompletionResponse({ values: ['a', 'b'], total: 5, hasMore: true });
  assert.deepEqual(r.completion.values, ['a', 'b']);
  assert.equal(r.completion.total, 5);
  assert.equal(r.completion.hasMore, true);
});

test('buildCompletionResponse: total defaults to values length', () => {
  const r = buildCompletionResponse({ values: ['x', 'y', 'z'] });
  assert.equal(r.completion.total, 3);
  assert.equal(r.completion.hasMore, false);
});

test('buildHardenedCapabilities: includes roots, tasks, completion', () => {
  const c = buildHardenedCapabilities();
  assert.ok(c.roots);
  assert.ok(c.tasks);
  assert.ok(c.tasks.cancellable);
  assert.ok(c.completion);
  assert.equal(c.completion.argument, true);
  assert.ok(c.tools);
  assert.ok(c.resources);
  assert.ok(c.prompts);
});

test('SUPPORTED_PROTOCOL_VERSIONS: includes current and legacy', () => {
  assert.ok(SUPPORTED_PROTOCOL_VERSIONS.includes('2025-11-25'));
  assert.ok(SUPPORTED_PROTOCOL_VERSIONS.includes('2025-06-01'));
});
