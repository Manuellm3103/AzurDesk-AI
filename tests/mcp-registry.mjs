import test from 'node:test';
import assert from 'node:assert/strict';
import registry from '../src/services/mcpRegistryService.js';

test('seed and search registry', () => {
  const all = registry.search('');
  assert.ok(all.length >= 4);
  const github = registry.search('github');
  assert.equal(github[0].id, 'github');
});

test('install and list', () => {
  const installed = registry.install('github');
  assert.ok(installed.installed);
  const list = registry.listInstalled();
  assert.ok(list.some(s => s.id === 'github'));
});
