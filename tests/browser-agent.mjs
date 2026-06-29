import test from 'node:test';
import assert from 'node:assert/strict';
import browser from '../src/services/browserAgentService.js';

test('browser agent stub when playwright missing', async () => {
  const r = await browser.navigate('http://example.com');
  assert.equal(r.success, false);
  assert.ok(r.error);
});

test('extractText returns stub error', async () => {
  const r = await browser.extractText('h1');
  assert.equal(r.success, false);
});
