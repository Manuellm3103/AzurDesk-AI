// Skill Marketplace — discoverable, installable, signed agent skills.
// Each skill is a versioned, content-hashed record published by an author
// (AzurDesk team, partners, or community). Tenants install/uninstall and
// rate skills. Distribution happens via the MCP 1.0 installable tool/prompt
// mechanism.
//
// Schema (marketplace.skills):
//   id, slug, name, description, author, version, content_hash,
//   install_count, avg_rating, category, kind (tool|prompt|agent),
//   entrypoint, signature, created_at
// Schema (marketplace.installs):
//   id, tenant_id, skill_id, installed_version, installed_at, enabled
// Schema (marketplace.reviews):
//   id, tenant_id, skill_id, rating (1-5), comment, created_at

import { randomUUID, createHash, createHmac } from 'crypto';
import db from './db.js';
import { now } from './_utils.js';

const SIGNING_SECRET = process.env.MARKETPLACE_SIGNING_SECRET || 'azurdesk-marketplace-dev-secret';

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_skills (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      author TEXT NOT NULL,
      version TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      install_count INTEGER DEFAULT 0,
      avg_rating REAL DEFAULT 0,
      category TEXT,
      kind TEXT NOT NULL,
      entrypoint TEXT,
      signature TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_category ON marketplace_skills (category);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_kind ON marketplace_skills (kind);

    CREATE TABLE IF NOT EXISTS marketplace_installs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      installed_version TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      UNIQUE(tenant_id, skill_id)
    );
    CREATE INDEX IF NOT EXISTS idx_marketplace_installs_tenant ON marketplace_installs (tenant_id);

    CREATE TABLE IF NOT EXISTS marketplace_reviews (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, skill_id)
    );
  `);
}

function contentHash(skill) {
  return createHash('sha256').update(JSON.stringify({
    slug: skill.slug, name: skill.name, version: skill.version, entrypoint: skill.entrypoint
  })).digest('hex');
}

function signSkill(skill) {
  const payload = `${skill.id}|${skill.slug}|${skill.version}|${skill.content_hash}`;
  return createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
}

function verifySignature(skill) {
  return skill.signature === signSkill(skill);
}

class MarketplaceService {
  constructor() { ensureTables(); }

  publish({ slug, name, description, author, version, category, kind, entrypoint }) {
    ensureTables();
    if (!slug || !name || !author || !version || !kind) {
      return { success: false, error: 'slug, name, author, version, kind are required' };
    }
    if (!['tool', 'prompt', 'agent'].includes(kind)) {
      return { success: false, error: 'kind must be tool|prompt|agent' };
    }
    const id = randomUUID();
    const content_hash = contentHash({ slug, name, version, entrypoint });
    const skill = { id, slug, name, description: description || '', author, version, content_hash, category: category || 'general', kind, entrypoint: entrypoint || null };
    skill.signature = signSkill(skill);
    try {
      db.prepare(`INSERT INTO marketplace_skills (id, slug, name, description, author, version, content_hash, install_count, avg_rating, category, kind, entrypoint, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`)
        .run(id, slug, name, skill.description, author, version, content_hash, skill.category, kind, skill.entrypoint, skill.signature, now());
      return { success: true, skill: this.get(id) };
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return { success: false, error: `Skill with slug "${slug}" already exists` };
      }
      return { success: false, error: e.message };
    }
  }

  get(id) {
    ensureTables();
    const row = db.prepare('SELECT * FROM marketplace_skills WHERE id = ?').get(id);
    if (!row) return null;
    return { ...row, verified: verifySignature(row) };
  }

  getBySlug(slug) {
    ensureTables();
    const row = db.prepare('SELECT * FROM marketplace_skills WHERE slug = ?').get(slug);
    if (!row) return null;
    return { ...row, verified: verifySignature(row) };
  }

  search({ q = '', category, kind, limit = 50 } = {}) {
    ensureTables();
    let sql = 'SELECT * FROM marketplace_skills WHERE 1=1';
    const args = [];
    if (q) { sql += ' AND (name LIKE ? OR description LIKE ? OR author LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (category) { sql += ' AND category = ?'; args.push(category); }
    if (kind) { sql += ' AND kind = ?'; args.push(kind); }
    sql += ' ORDER BY install_count DESC, avg_rating DESC LIMIT ?';
    args.push(limit);
    return db.prepare(sql).all(...args).map((r) => ({ ...r, verified: verifySignature(r) }));
  }

  install(tenant_id, skill_id) {
    ensureTables();
    const skill = this.get(skill_id);
    if (!skill) return { success: false, error: 'Skill not found' };
    if (!skill.verified) return { success: false, error: 'Skill signature invalid' };
    const id = randomUUID();
    try {
      db.prepare(`INSERT INTO marketplace_installs (id, tenant_id, skill_id, installed_version, installed_at, enabled) VALUES (?, ?, ?, ?, ?, 1)`)
        .run(id, tenant_id, skill_id, skill.version, now());
      db.prepare('UPDATE marketplace_skills SET install_count = install_count + 1 WHERE id = ?').run(skill_id);
      return { success: true, install: { id, skill_id, version: skill.version, name: skill.name } };
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return { success: false, error: 'Already installed' };
      }
      return { success: false, error: e.message };
    }
  }

  uninstall(tenant_id, skill_id) {
    ensureTables();
    const r = db.prepare('DELETE FROM marketplace_installs WHERE tenant_id = ? AND skill_id = ?').run(tenant_id, skill_id);
    if (r.changes > 0) {
      db.prepare('UPDATE marketplace_skills SET install_count = MAX(0, install_count - 1) WHERE id = ?').run(skill_id);
      return { success: true };
    }
    return { success: false, error: 'Not installed' };
  }

  listInstalled(tenant_id) {
    ensureTables();
    return db.prepare(`
      SELECT s.*, i.installed_at, i.installed_version, i.enabled
      FROM marketplace_installs i
      JOIN marketplace_skills s ON s.id = i.skill_id
      WHERE i.tenant_id = ?
      ORDER BY i.installed_at DESC
    `).all(tenant_id).map((r) => ({ ...r, verified: verifySignature(r) }));
  }

  review(tenant_id, skill_id, { rating, comment }) {
    ensureTables();
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return { success: false, error: 'rating must be 1-5' };
    }
    const id = randomUUID();
    try {
      db.prepare(`INSERT INTO marketplace_reviews (id, tenant_id, skill_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, tenant_id, skill_id, r, comment || null, now());
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        db.prepare(`UPDATE marketplace_reviews SET rating = ?, comment = ?, created_at = ? WHERE tenant_id = ? AND skill_id = ?`)
          .run(r, comment || null, now(), tenant_id, skill_id);
      } else {
        return { success: false, error: e.message };
      }
    }
    // Recompute avg rating
    const agg = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM marketplace_reviews WHERE skill_id = ?').get(skill_id);
    db.prepare('UPDATE marketplace_skills SET avg_rating = ? WHERE id = ?').run(agg.avg || 0, skill_id);
    return { success: true, rating: r, avg_rating: agg.avg, count: agg.cnt };
  }

  stats() {
    ensureTables();
    const total = db.prepare('SELECT COUNT(*) as c FROM marketplace_skills').get().c;
    const installs = db.prepare('SELECT COUNT(*) as c FROM marketplace_installs').get().c;
    const reviews = db.prepare('SELECT COUNT(*) as c FROM marketplace_reviews').get().c;
    return { total_skills: total, total_installs: installs, total_reviews: reviews };
  }
}

export default new MarketplaceService();
