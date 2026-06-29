import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import db from './db.js';
import { now, randomId } from './_utils.js';

const ASSET_DIR = join(process.cwd(), 'data', 'assets');
mkdirSync(ASSET_DIR, { recursive: true });

export function getTenantUsage(tenant_id) {
  const row = db.prepare('SELECT SUM(size_bytes) as total FROM tenant_assets WHERE tenant_id = ?').get(tenant_id);
  return row.total || 0;
}

function getQuotaBytes(tenant_id) {
  const quota = db.prepare('SELECT max_storage_mb FROM tenant_quotas WHERE tenant_id = ?').get(tenant_id);
  const mb = quota ? quota.max_storage_mb : 1024;
  return mb * 1024 * 1024;
}

export async function upload(tenant_id, filename, content, mime_type = 'application/octet-stream') {
  if (!tenant_id || !filename || !content) throw new Error('tenant_id, filename y content requeridos');
  const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8');
  const used = getTenantUsage(tenant_id);
  const quota = getQuotaBytes(tenant_id);
  if (used + size > quota) throw new Error('Quota de almacenamiento excedida');

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const stored = `${randomId('asset')}-${safeFilename}`;
  const tenantDir = join(ASSET_DIR, tenant_id);
  mkdirSync(tenantDir, { recursive: true });
  const fullPath = join(tenantDir, stored);

  await writeFile(fullPath, content);
  const id = randomId('asset');
  db.prepare('INSERT INTO tenant_assets (id, tenant_id, filename, path, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, tenant_id, filename, fullPath, mime_type, size, now());
  return { id, tenant_id, filename, size_bytes: size, mime_type, created_at: now() };
}

export function listAssets(tenant_id) {
  return db.prepare('SELECT id, tenant_id, filename, mime_type, size_bytes, created_at FROM tenant_assets WHERE tenant_id = ? ORDER BY created_at DESC').all(tenant_id);
}

export function getAsset(id, tenant_id) {
  return db.prepare('SELECT * FROM tenant_assets WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
}

export async function deleteAsset(id, tenant_id) {
  const asset = getAsset(id, tenant_id);
  if (!asset) return false;
  if (existsSync(asset.path)) await unlink(asset.path);
  db.prepare('DELETE FROM tenant_assets WHERE id = ? AND tenant_id = ?').run(id, tenant_id);
  return true;
}

export function getStorageStats(tenant_id) {
  const used = getTenantUsage(tenant_id);
  return { used_bytes: used, quota_bytes: getQuotaBytes(tenant_id), files: db.prepare('SELECT COUNT(*) as count FROM tenant_assets WHERE tenant_id = ?').get(tenant_id).count };
}

export default { upload, listAssets, getAsset, deleteAsset, getStorageStats, getTenantUsage };