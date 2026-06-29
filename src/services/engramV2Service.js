import db from './db.js';
import { now } from './_utils.js';

export function decayImportance(engramId, halfLifeDays = 7) {
  const row = db.prepare('SELECT created_at, access_count, importance FROM engrams WHERE id=?').get(engramId);
  if (!row) return null;
  const ageDays = (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const decay = Math.exp(-Math.LN2 * ageDays / halfLifeDays);
  const boosted = row.access_count > 0 ? 1.2 : 1.0;
  const newImportance = Math.max(0.1, (row.importance || 1) * decay * boosted);
  db.prepare('UPDATE engrams SET importance=? WHERE id=?').run(newImportance, engramId);
  return newImportance;
}

export function addKnowledgeGraphEdge(tenant_id, fromId, toId, relation) {
  db.prepare('INSERT OR IGNORE INTO memory_graph_edges (tenant_id, from_id, to_id, relation, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant_id, fromId, toId, relation, now());
  return { tenant_id, fromId, toId, relation };
}

export function getRelatedMemories(tenant_id, engramId) {
  return db.prepare('SELECT * FROM memory_graph_edges WHERE tenant_id=? AND (from_id=? OR to_id=?)').all(tenant_id, engramId, engramId);
}
