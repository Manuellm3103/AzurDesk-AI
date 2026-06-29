import db from './db.js';
import { now } from './_utils.js';
import { randomUUID, createHash } from 'crypto';

// ReBAC / Zanzibar-lite authorization service.
// Stores relation tuples: object_type:object_id#relation@user_type:user_id
// Supports direct and simple indirect checks via tuple expansion.

function zookie(tenant_id, object_type, object_id) {
  const base = `${tenant_id}:${object_type}:${object_id}:${now()}`;
  return createHash('sha256').update(base).digest('hex').slice(0, 24);
}

const authorizationService = {
  ensureTables() {
    // Migrations in db.js.
  },

  write(tenant_id, { object_type, object_id, relation, user_type, user_id }) {
    this.ensureTables();
    const existing = db.prepare(`SELECT id FROM authz_relations
      WHERE tenant_id = ? AND object_type = ? AND object_id = ? AND relation = ? AND user_type = ? AND user_id = ?`).get(tenant_id, object_type, object_id, relation, user_type, user_id);
    if (existing) return { id: existing.id, duplicate: true };
    const id = randomUUID();
    const created = now();
    db.prepare(`INSERT INTO authz_relations (id, tenant_id, object_type, object_id, relation, user_type, user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tenant_id, object_type, object_id, relation, user_type, user_id, created);
    return { id, tenant_id, object_type, object_id, relation, user_type, user_id, created_at: created };
  },

  deleteTuple(tenant_id, { object_type, object_id, relation, user_type, user_id }) {
    this.ensureTables();
    const info = db.prepare(`DELETE FROM authz_relations
      WHERE tenant_id = ? AND object_type = ? AND object_id = ? AND relation = ? AND user_type = ? AND user_id = ?`)
      .run(tenant_id, object_type, object_id, relation, user_type, user_id);
    return info.changes > 0;
  },

  list(tenant_id, { object_type, object_id, relation, user_id, limit = 100 } = {}) {
    this.ensureTables();
    let sql = `SELECT * FROM authz_relations WHERE tenant_id = ?`;
    const args = [tenant_id];
    if (object_type) { sql += ` AND object_type = ?`; args.push(object_type); }
    if (object_id) { sql += ` AND object_id = ?`; args.push(object_id); }
    if (relation) { sql += ` AND relation = ?`; args.push(relation); }
    if (user_id) { sql += ` AND user_id = ?`; args.push(user_id); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(limit);
    return db.prepare(sql).all(...args);
  },

  // Check if user has relation on object. Supports direct and one-level indirect via userset.
  check(tenant_id, { object_type, object_id, relation, user_type, user_id, zookie: reqZookie }) {
    this.ensureTables();
    const direct = db.prepare(`SELECT id FROM authz_relations
      WHERE tenant_id = ? AND object_type = ? AND object_id = ? AND relation = ? AND user_type = ? AND user_id = ?`)
      .get(tenant_id, object_type, object_id, relation, user_type, user_id);
    if (direct) return { allowed: true, reason: 'direct', zookie: reqZookie || zookie(tenant_id, object_type, object_id) };

    // Check wildcard usersets: e.g., group:eng#member and user is member of that group.
    const usersets = db.prepare(`SELECT user_type, user_id FROM authz_relations
      WHERE tenant_id = ? AND object_type = ? AND object_id = ? AND relation = ? AND user_type != 'user'`)
      .all(tenant_id, object_type, object_id, relation);
    for (const us of usersets) {
      const member = db.prepare(`SELECT id FROM authz_relations
        WHERE tenant_id = ? AND object_type = ? AND object_id = ? AND relation = 'member' AND user_type = ? AND user_id = ?`)
        .get(tenant_id, us.user_type, us.user_id, user_type, user_id);
      if (member) return { allowed: true, reason: `userset:${us.user_type}:${us.user_id}`, zookie: reqZookie || zookie(tenant_id, object_type, object_id) };
    }

    // Owner implies viewer/editor depending on relation requested.
    if (relation === 'viewer' || relation === 'editor') {
      const owner = db.prepare(`SELECT id FROM authz_relations
        WHERE tenant_id = ? AND object_type = ? AND object_id = ? AND relation = 'owner' AND user_type = ? AND user_id = ?`)
        .get(tenant_id, object_type, object_id, user_type, user_id);
      if (owner) return { allowed: true, reason: 'owner-implies-' + relation, zookie: reqZookie || zookie(tenant_id, object_type, object_id) };
    }

    return { allowed: false, reason: 'no relation', zookie: reqZookie || zookie(tenant_id, object_type, object_id) };
  },

  // Snapshot a checkpoint for object.
  snapshot(tenant_id, object_type, object_id) {
    this.ensureTables();
    const zk = zookie(tenant_id, object_type, object_id);
    const id = randomUUID();
    db.prepare(`INSERT INTO authz_checkpoints (id, tenant_id, object_type, object_id, zookie, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, tenant_id, object_type, object_id, zk, now());
    return { object_type, object_id, zookie: zk };
  },

  expand(tenant_id, { object_type, object_id, relation }) {
    this.ensureTables();
    const rows = db.prepare(`SELECT * FROM authz_relations
      WHERE tenant_id = ? AND object_type = ? AND object_id = ? AND relation = ?
      ORDER BY created_at DESC`).all(tenant_id, object_type, object_id, relation);
    return rows;
  }
};

export default authorizationService;
