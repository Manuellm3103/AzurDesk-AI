import db from '../services/db.js';
import { safeJson } from '../services/_utils.js';
import { natural } from './similaritySearch.js';
const { WordTokenizer, PorterStemmerEs, PorterStemmer } = natural;

class GraphRAGService {
  constructor(database = db) {
    this.db = database;
    this._ensureTables();
  }

  _ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_entities (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        kind TEXT,
        metadata TEXT,
        UNIQUE(tenant_id, name, kind)
      );
      CREATE TABLE IF NOT EXISTS kb_relations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        source TEXT,
        target TEXT,
        relation TEXT,
        weight REAL DEFAULT 1.0,
        UNIQUE(tenant_id, source, target, relation)
      );
      CREATE TABLE IF NOT EXISTS kb_entity_occurrences (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        entity_name TEXT,
        article_id TEXT,
        context TEXT
      );
    `);
  }

  _tokenize(text) {
    const tokenizer = new WordTokenizer();
    return tokenizer.tokenize(String(text).toLowerCase()) || [];
  }

  _stem(word) {
    return /[^\u0000-\u007F]/.test(word) ? PorterStemmerEs.stem(word) : PorterStemmer.stem(word);
  }

  extractEntities(text) {
    const tokens = this._tokenize(text);
    const stop = new Set(['el','la','los','las','un','una','de','del','al','en','con','por','para','que','se','es','son','su','sus','este','esta','como','más','mas','o','y','a','the','is','are','to','of','in','and','for','with','on','a','an']);
    const entities = new Map();
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i].replace(/[^a-z0-9áéíóúüñ]/gi, '');
      if (!w || w.length < 4 || stop.has(w)) continue;
      const stem = this._stem(w);
      const existing = entities.get(stem);
      if (!existing || w.length > existing.name.length) entities.set(stem, { name: w, kind: 'term' });
    }
    // N-grams (2..3)
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const phrase = tokens.slice(i, i + n).filter((t) => !stop.has(t) && t.length > 2);
        if (phrase.length < n) continue;
        const name = phrase.join(' ');
        const stem = phrase.map((x) => this._stem(x)).join('_');
        entities.set(stem, { name, kind: 'phrase' });
      }
    }
    return Array.from(entities.values());
  }

  upsertArticleGraph({ tenant_id, article_id, title, content, tags }) {
    const text = [title, content, tags].filter(Boolean).join(' ');
    const entities = this.extractEntities(text);
    const insert = this.db.prepare('INSERT OR REPLACE INTO kb_entities (id, tenant_id, name, kind, metadata) VALUES (?, ?, ?, ?, ?)');
    const rel = this.db.prepare('INSERT OR REPLACE INTO kb_relations (id, tenant_id, source, target, relation, weight) VALUES (?, ?, ?, ?, ?, ?)');
    const occ = this.db.prepare('INSERT INTO kb_entity_occurrences (id, tenant_id, entity_name, article_id, context) VALUES (?, ?, ?, ?, ?)');

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM kb_entity_occurrences WHERE tenant_id=? AND article_id=?').run(tenant_id, article_id);
      for (const e of entities) {
        const id = [tenant_id, e.name, e.kind].join('|');
        insert.run(id, tenant_id, e.name, e.kind, JSON.stringify({ article_id }));
        occ.run([tenant_id, e.name, article_id].join('|'), tenant_id, e.name, article_id, title || '');
      }
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const id = [tenant_id, entities[i].name, 'cooccurs', entities[j].name].join('|');
          rel.run(id, tenant_id, entities[i].name, entities[j].name, 'cooccurs', 1.0);
        }
      }
    })();
    return { entities: entities.length, relations: (entities.length * (entities.length - 1)) / 2 };
  }

  search({ tenant_id, query, limit = 5 }) {
    const qEntities = this.extractEntities(query).map((e) => e.name);
    const placeholders = qEntities.map(() => '?').join(',');
    const articles = new Map();
    if (qEntities.length) {
      const rows = this.db.prepare(`SELECT article_id, entity_name, context FROM kb_entity_occurrences WHERE tenant_id=? AND entity_name IN (${placeholders})`).all(tenant_id, ...qEntities);
      for (const r of rows) {
        const a = articles.get(r.article_id) || { id: r.article_id, score: 0, matched: new Set() };
        a.score += 1;
        a.matched.add(r.entity_name);
        articles.set(r.article_id, a);
      }
    }
    // Graph expansion via relations
    const expansion = new Map();
    for (const e of qEntities) {
      const related = this.db.prepare(`SELECT source, target, weight FROM kb_relations WHERE tenant_id=? AND (source=? OR target=?)`).all(tenant_id, e, e);
      for (const r of related) {
        const name = r.source === e ? r.target : r.source;
        expansion.set(name, (expansion.get(name) || 0) + r.weight);
      }
    }
    const expanded = Array.from(expansion.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit * 2);
    for (const [name] of expanded) {
      const rows = this.db.prepare('SELECT article_id, context FROM kb_entity_occurrences WHERE tenant_id=? AND entity_name=? LIMIT 5').all(tenant_id, name);
      for (const r of rows) {
        const a = articles.get(r.article_id) || { id: r.article_id, score: 0, matched: new Set() };
        a.score += 0.5;
        a.matched.add(name);
        articles.set(r.article_id, a);
      }
    }
    return Array.from(articles.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id, a]) => ({ article_id: id, score: a.score, matched: Array.from(a.matched) }));
  }

  getGraph(tenant_id, limit = 50) {
    const entities = this.db.prepare('SELECT name, kind FROM kb_entities WHERE tenant_id=? LIMIT ?').all(tenant_id, limit);
    const relations = this.db.prepare('SELECT source, target, relation, weight FROM kb_relations WHERE tenant_id=? LIMIT ?').all(tenant_id, limit * 2);
    return { entities, relations };
  }
}

export default new GraphRAGService();
