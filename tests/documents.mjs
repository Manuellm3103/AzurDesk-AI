import test from 'node:test';
import assert from 'node:assert/strict';
import documentService from '../src/services/documentService.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const TMP = join(process.cwd(), 'tmp_test_docs');

test('documentService extrae texto de PDF', async () => {
  mkdirSync(TMP, { recursive: true });
  const pdfPath = join(TMP, 'test.pdf');
  const script = `import pymupdf; d=pymupdf.open(); d.new_page(); d[0].insert_text((50,50),'Hola PDF de prueba'); d.save(r'''${pdfPath}''')`;
  execFileSync('python', ['-c', script]);
  const r = await documentService.extractFromFile(pdfPath, '.pdf');
  assert.ok(r.text.includes('Hola PDF'));
  rmSync(TMP, { recursive: true, force: true });
});

test('documentService extrae texto de DOCX', async () => {
  mkdirSync(TMP, { recursive: true });
  const docxPath = join(TMP, 'test.docx');
  const script = `from docx import Document; d=Document(); d.add_paragraph('Hola DOCX de prueba'); d.save(r'''${docxPath}''')`;
  execFileSync('python', ['-c', script]);
  const r = await documentService.extractFromFile(docxPath, '.docx');
  assert.ok(r.text.includes('Hola DOCX'));
  rmSync(TMP, { recursive: true, force: true });
});
