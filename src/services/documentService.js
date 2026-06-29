import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import db from './db.js';
import { now } from './_utils.js';

const execFileAsync = promisify(execFile);
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

class DocumentService {
  constructor() {
    fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
  }

  async saveUpload(buffer, filename) {
    const id = randomUUID();
    const ext = extname(filename) || '.bin';
    const storedName = `${id}${ext}`;
    const path = join(UPLOAD_DIR, storedName);
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path, buffer);
    return { id, filename, storedName, path, size: buffer.length, ext };
  }

  async extractFromFile(filePath, ext) {
    if (ext.toLowerCase() === '.pdf') return this.extractPdf(filePath);
    if (['.docx', '.doc'].includes(ext.toLowerCase())) return this.extractDocx(filePath);
    if (ext.toLowerCase() === '.txt') return { text: await fs.readFile(filePath, 'utf-8'), source: 'txt' };
    throw new Error(`Extensión no soportada: ${ext}`);
  }

  _escapePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
  }

  async extractPdf(filePath) {
    const script = `import sys, pymupdf; doc=pymupdf.open(r'''${filePath}'''); print('---PAGE---'.join([p.get_text() for p in doc]))`;
    const { stdout, stderr } = await execFileAsync('python', ['-c', script], { timeout: 60000 });
    if (stderr && stderr.trim()) console.error('pymupdf stderr:', stderr.trim());
    const pages = stdout.split('---PAGE---');
    return { text: pages.join('\n\n'), pages: pages.map((t, i) => ({ page: i + 1, text: t.trim() })), source: 'pymupdf' };
  }

  async extractDocx(filePath) {
    const script = `from docx import Document; d=Document(r'''${filePath}'''); print(chr(10).join([p.text for p in d.paragraphs]))`;
    const { stdout, stderr } = await execFileAsync('python', ['-c', script], { timeout: 60000 });
    if (stderr && stderr.trim()) console.error('docx stderr:', stderr.trim());
    return { text: stdout, pages: [{ page: 1, text: stdout }], source: 'python-docx' };
  }

  async extractFromUrl(url) {
    const { web_extract } = await import('hermes_tools');
    const r = await web_extract({ urls: [url] });
    const first = (r.results || [])[0];
    if (!first || first.error) throw new Error(first?.error || 'No se pudo extraer URL');
    return { text: first.content || '', source: 'web_extract', title: first.title };
  }

  async extract({ buffer, filename, url, ocr = false } = {}) {
    if (url) return this.extractFromUrl(url);
    if (!buffer || !filename) throw new Error('Se requiere buffer+filename o url');
    const upload = await this.saveUpload(buffer, filename);
    if (ocr) {
      try {
        const markerScript = join(process.env.HERMES_HOME || process.env.USERPROFILE, 'AppData/Local/hermes/skills/productivity/ocr-and-documents/scripts/extract_marker.py');
        const { stdout } = await execFileAsync('python', [markerScript, upload.path], { timeout: 120000 });
        return { ...upload, text: stdout, source: 'marker-pdf-ocr' };
      } catch (e) { console.error('OCR fallback failed, using pymupdf', e.message); }
    }
    const extracted = await this.extractFromFile(upload.path, upload.ext);
    this.saveDocumentRecord({ ...upload, extracted });
    return { ...upload, ...extracted };
  }

  saveDocumentRecord({ id, filename, storedName, size, ext, text, source }) {
    db.prepare('INSERT OR REPLACE INTO documents (id, filename, stored_name, size, ext, text, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, filename, storedName, size, ext, text || '', source || '', now());
  }

  list(limit = 20) {
    return db.prepare('SELECT id, filename, size, ext, source, created_at FROM documents ORDER BY created_at DESC LIMIT ?').all(limit);
  }
}

export default new DocumentService();
