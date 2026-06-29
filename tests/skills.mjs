import test from 'node:test';
import assert from 'node:assert/strict';
import orchestratorService from '../src/services/orchestratorService.js';
import reviewService from '../src/services/reviewService.js';
import * as obsidianService from '../src/services/obsidianService.js';

test('orchestratorService loop DISCOVER → DONE', () => {
  const run = orchestratorService.start({ tenant_id: 't1', user_id: 'u1', goal: 'Integrar pagos' });
  assert.equal(run.state, 'DISCOVER');
  const adv1 = orchestratorService.advance(run.id, 't1', { evidence: { note: 'tickets revisados' } });
  assert.equal(adv1.state, 'PLAN');
  const adv2 = orchestratorService.advance(run.id, 't1', { evidence: { plan: 'listo' } });
  assert.equal(adv2.state, 'IMPLEMENT');
  const adv3 = orchestratorService.advance(run.id, 't1', { evidence: { code: 'listo' } });
  assert.equal(adv3.state, 'VERIFY');
  const adv4 = orchestratorService.advance(run.id, 't1', { evidence: { tests: 'pass' }, gates: { quality: true, safety: true, token: true } });
  assert.equal(adv4.state, 'MERGE');
  const done = orchestratorService.advance(run.id, 't1', { evidence: { pr: 'merged' } });
  assert.equal(done.state, 'DONE');
});

test('reviewService detecta problemas', () => {
  const r = reviewService.review(`const password='secret';\neval(code);\nconsole.log('x');`);
  assert.equal(r.overall, false);
  assert.ok(r.summary.some((s) => s.rubric === 'security' && !s.pass));
  assert.ok(r.summary.some((s) => s.rubric === 'quality' && !s.pass));
});

test('obsidianService escribe y lee notas', { skip: true }, () => {
  // requiere vault real; skipped en CI
  const vaultPath = 'C:\\Users\\Manu\\Documents\\Obsidian Vault';
  const note = obsidianService.writeNote(vaultPath, 'AzurDesk', 'test-skip.md', 'contenido de prueba');
  assert.ok(note.path.endsWith('.md'));
  const read = obsidianService.readNote(note.path);
  assert.ok((read || '').includes('contenido de prueba'));
});
