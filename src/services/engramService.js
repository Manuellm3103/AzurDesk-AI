import db from './db.js';
import { safeJson, now } from './_utils.js';
import { randomUUID } from 'crypto';
import { natural } from '../ml/similaritySearch.js';
const { WordTokenizer, PorterStemmerEs, PorterStemmer } = natural;

function stem(w) { return /[^\u0000-\u007F]/.test(w) ? PorterStemmerEs.stem(w) : PorterStemmer.stem(w); }
function tokens(t) { return (new WordTokenizer().tokenize(String(t).toLowerCase()) || []).map(stem); }
function vector(t) { const v = {}; for (const x of tokens(t)) v[x] = (v[x] || 0) + 1; return v; }
function cosine(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) { const va = a[k] || 0, vb = b[k] || 0; dot += va * vb; na += va * va; nb += vb * vb; }
  const d = Math.sqrt(na) * Math.sqrt(nb); return d ? dot / d : 0;
}

class EngramService {
  remember({ tenant_id, user_id, session_id, content, type = 'episodic', importance = 1.0, confidence = 1.0, summary = null }) {
    const id = randomUUID();
    db.prepare('INSERT INTO engrams (id, tenant_id, user_id, session_id, type, content, summary, vector, importance, confidence, access_count, last_accessed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, user_id, session_id || null, type, content, summary, JSON.stringify(vector(content)), importance, confidence, 0, now(), now(), now());
    return { id, tenant_id, user_id, type };
  }

  recall({ tenant_id, user_id, query, type = null, topK = 5 }) {
    const qv = vector(query);
    let sql = 'SELECT * FROM engrams WHERE tenant_id=? AND (user_id=? OR (? IS NULL AND user_id IS NULL))';
    const params = [tenant_id, user_id, user_id];
    if (type) { sql += ' AND type=?'; params.push(type); }
    sql += ' ORDER BY updated_at DESC LIMIT 200';
    const rows = db.prepare(sql).all(...params);
    return rows
      .map(r => ({ ...r, vector: safeJson(r.vector, {}), score: cosine(qv, safeJson(r.vector, {})) * r.importance * r.confidence }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  recallForTenant({ tenant_id, query, topK = 5 }) {
    const qv = vector(query);
    const rows = db.prepare('SELECT * FROM engrams WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 200').all(tenant_id);
    return rows
      .map(r => ({ ...r, score: cosine(qv, safeJson(r.vector, {})) * r.importance * r.confidence }))
      .sort((a, b) => b.score - a.score).slice(0, topK);
  }

  access(id) {
    db.prepare('UPDATE engrams SET access_count = access_count + 1, last_accessed = ? WHERE id=?').run(now(), id);
  }

  forget({ tenant_id, user_id, before }) {
    const sql = before
      ? 'DELETE FROM engrams WHERE tenant_id=? AND user_id=? AND created_at < ? AND importance < 1.5'
      : 'DELETE FROM engrams WHERE tenant_id=? AND user_id=?';
    const params = before ? [tenant_id, user_id, before] : [tenant_id, user_id];
    return { deleted: db.prepare(sql).run(...params).changes };
  }

  consolidate({ tenant_id, user_id }) {
    const rows = db.prepare('SELECT content FROM engrams WHERE tenant_id=? AND user_id=? ORDER BY updated_at DESC LIMIT 50').all(tenant_id, user_id);
    const summary = rows.map((r, i) => `${i + 1}. ${r.content}`).join('\n');
    db.prepare('INSERT INTO memory_summaries (id, tenant_id, user_id, summary, based_on_count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), tenant_id, user_id, summary, rows.length, now());
    return { summary, based_on: rows.length };
  }

  getSummaries({ tenant_id, user_id, limit = 5 }) {
    return db.prepare('SELECT * FROM memory_summaries WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, user_id, limit);
  }
}

export default new EngramService();
