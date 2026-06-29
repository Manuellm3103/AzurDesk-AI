import { homedir } from 'os';
import { existsSync, readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

const DEFAULT_VAULT_PATHS = [
  join(homedir(), 'Documents', 'Obsidian Vault'),
  join(homedir(), 'Obsidian Vault'),
  join(process.cwd(), 'data', 'obsidian-vault')
];

export function detectVault() {
  for (const p of DEFAULT_VAULT_PATHS) {
    if (existsSync(p)) return { path: p, exists: true };
  }
  const fallback = join(process.cwd(), 'data', 'obsidian-vault');
  return { path: fallback, exists: false };
}

export function listFolders(vaultPath = detectVault().path) {
  if (!existsSync(vaultPath)) return [];
  return readdirSync(vaultPath)
    .filter(f => {
      const full = join(vaultPath, f);
      try { return statSync(full).isDirectory() && !f.startsWith('.'); }
      catch { return false; }
    })
    .map(f => ({ name: f, path: join(vaultPath, f) }));
}

export function listNotes(folderPath) {
  if (!folderPath || !existsSync(folderPath)) return [];
  return readdirSync(folderPath)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, path: join(folderPath, f) }));
}

export function readNote(notePath) {
  if (!notePath || !existsSync(notePath)) return null;
  try { return readFileSync(notePath, 'utf8'); }
  catch { return null; }
}

export function writeNote(vaultPath, folder, filename, content) {
  const dir = join(vaultPath, folder);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, filename.endsWith('.md') ? filename : `${filename}.md`);
  writeFileSync(file, content, 'utf8');
  return { path: file, name: basename(file) };
}

export function searchNotes(vaultPath, query) {
  if (!vaultPath || !existsSync(vaultPath)) return [];
  const q = query.toLowerCase();
  const results = [];
  for (const folder of listFolders(vaultPath)) {
    for (const note of listNotes(folder.path)) {
      const content = readNote(note.path) || '';
      if (content.toLowerCase().includes(q) || note.name.toLowerCase().includes(q)) {
        results.push({ folder: folder.name, ...note, snippet: content.slice(0, 200) });
      }
    }
  }
  return results;
}
