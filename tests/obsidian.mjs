import test from 'node:test';
import assert from 'node:assert/strict';
import * as obsidianService from '../src/services/obsidianService.js';

test('ObsidianService detecta vault', () => {
  const vault = obsidianService.detectVault();
  assert.ok(vault);
  assert.ok(vault.path);
  assert.ok(typeof vault.exists === 'boolean');
});

test('ObsidianService lista carpetas', () => {
  const vault = obsidianService.detectVault();
  if (!vault.exists) {
    console.log('Vault no encontrado, saltando test de listFolders');
    return;
  }
  const folders = obsidianService.listFolders(vault.path);
  assert.ok(Array.isArray(folders));
});

test('ObsidianService escribe y lee nota en vault fallback', () => {
  const vault = obsidianService.detectVault();
  const note = obsidianService.writeNote(vault.path, 'AzurDesk', 'test-note.md', '# Test\nContenido');
  assert.ok(note.path);
  const content = obsidianService.readNote(note.path);
  assert.ok(content.includes('# Test'));
});

test('ObsidianService busca en notas', () => {
  const vault = obsidianService.detectVault();
  const results = obsidianService.searchNotes(vault.path, 'Test');
  assert.ok(Array.isArray(results));
});
