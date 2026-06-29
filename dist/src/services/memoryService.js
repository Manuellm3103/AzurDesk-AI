import db from '../services/db.js';
import { safeJson, now } from '../services/_utils.js';
import { randomUUID } from 'crypto';
import { natural } from '../ml/similaritySearch.js';
const { WordTokenizer, PorterStemmerEs, PorterStemmer } = natural;

function stem(word) {
  return /[^\u0000-\u007F]/.test(word) ? PorterStemmerEs.stem(word) : PorterStemmer.stem(word);
}

function tokens(text) {
  return (new WordTokenizer().tokenize(String(text).toLowerCase()) || []).map(stem);
}

class MemoryService {
  constructor(database = db) {
    this.db = database;
    this._ensureTables();
  }

  _ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        user_id TEXT,
        session_id TEXT,
        scope TEXT DEFAULT 'session',
        content TEXT,
        importance REAL DEFAULT 1.0,
        confidence REAL DEFAULT 1.0,
        source TEXT,
        vector TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mem_user ON memories (tenant_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_mem_session ON memories (tenant_id, session_id);
    `);
  }

  cosine(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0, na = 0, nb = 0;
    for (const k of keys) {
      const va = a[k] || 0, vb = b[k] || 0;
      dot += va * vb; na += va * va; nb += vb * vb;
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d ? dot / d : 0;
  }

  vector(text) {
    const t = tokens(text);
    const v = {};
    for (const x of t) v[x] = (v[x] || 0) + 1;
    return v;
  }

  add({ tenant_id, user_id, session_id, scope = 'session', content, importance = 1.0, confidence = 1.0, source = 'manual' }) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO memories (id, tenant_id, user_id, session_id, scope, content, importance, confidence, source, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, user_id, session_id, scope, content, importance, confidence, source, JSON.stringify(this.vector(content)), now(), now());
    // knowledge graph edge
    this._linkToGraph({ tenant_id, user_id, content, confidence, source });
    return { id, scope, content };
  }

  _linkToGraph({ tenant_id, user_id, content, confidence, source }) {
    const t = tokens(content);
    const nouns = t.filter((w) => w.length > 3).slice(0, 5);
    if (nouns.length < 2) return;
    const head = nouns[0];
    for (let i = 1; i < nouns.length; i++) {
      db.prepare('INSERT INTO memory_graph (id, tenant_id, user_id, from_node, relation, to_node, confidence, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), tenant_id, user_id, head, 'related', nouns[i], confidence, source, now());
    }
  }

  recall({ tenant_id, user_id, session_id, query, topK = 5 }) {
    const qv = this.vector(query);
    const rows = this.db.prepare('SELECT * FROM memories WHERE tenant_id=? AND (user_id=? OR session_id=?) ORDER BY updated_at DESC LIMIT 200')
      .all(tenant_id, user_id, session_id);
    const scored = rows.map((r) => ({
      ...r,
      score: this.cosine(qv, safeJson(r.vector, {})) * r.importance * r.confidence
    })).sort((a, b) => b.score - a.score).slice(0, topK);
    return scored;
  }

  graph({ tenant_id, user_id, node, depth = 2 }) {
    let edges = [];
    if (node) {
      edges = db.prepare('SELECT * FROM memory_graph WHERE tenant_id=? AND user_id=? AND (from_node=? OR to_node=?)').all(tenant_id, user_id, node, node);
    } else {
      edges = db.prepare('SELECT * FROM memory_graph WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50').all(tenant_id, user_id);
    }
    return edges;
  }

  summarize({ tenant_id, user_id }) {
    const rows = this.db.prepare('SELECT content FROM memories WHERE tenant_id=? AND user_id=? ORDER BY updated_at DESC LIMIT 20').all(tenant_id, user_id);
    const summary = rows.map((r, i) => `${i + 1}. ${r.content}`).join('\n');
    return { summary };
  }

  deleteAll({ tenant_id, user_id }) {
    const info = this.db.prepare('DELETE FROM memories WHERE tenant_id=? AND user_id=?').run(tenant_id, user_id);
    db.prepare('DELETE FROM memory_graph WHERE tenant_id=? AND user_id=?').run(tenant_id, user_id);
    return { deleted: info.changes };
  }
}

export default new MemoryService();
