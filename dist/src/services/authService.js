import bcrypt from 'bcryptjs';
import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

const SALT_ROUNDS = 10;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'admin123';

class AuthService {
  constructor() {
    this.ensureDemoUser();
  }

  ensureDemoUser() {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get('admin@azurdesk.ai');
    const hash = bcrypt.hashSync(DEMO_PASSWORD, SALT_ROUNDS);
    if (!u) {
      db.prepare('INSERT INTO users (id, tenant_id, name, email, password_hash, role, level, skills, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        randomUUID(), 'demo', 'Administrador', 'admin@azurdesk.ai', hash, 'admin', 3, JSON.stringify(['all']), now()
      );
    } else if (!bcrypt.compareSync(DEMO_PASSWORD, u.password_hash)) {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, u.id);
    }
  }

  hash(password) {
    return bcrypt.hashSync(password, SALT_ROUNDS);
  }

  createUser({ tenant_id, name, email, password, role = 'agent', level = 1, skills = [] }) {
    const id = randomUUID();
    try {
      db.prepare('INSERT INTO users (id, tenant_id, name, email, password_hash, role, level, skills, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id, tenant_id, name, email, this.hash(password), role, level, JSON.stringify(skills), now()
      );
      return { id, name, email, role, level };
    } catch (e) { return null; }
  }

  authenticate(email, password) {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!u) return null;
    if (!bcrypt.compareSync(password, u.password_hash)) return null;
    return { id: u.id, tenant_id: u.tenant_id, name: u.name, email: u.email, role: u.role, level: u.level, skills: JSON.parse(u.skills || '[]') };
  }

  getUser(id) {
    const u = db.prepare('SELECT id, tenant_id, name, email, role, level, skills, created_at FROM users WHERE id=?').get(id);
    if (!u) return null;
    return { ...u, skills: JSON.parse(u.skills || '[]') };
  }

  listUsers({ tenant_id, limit = 50 } = {}) {
    let sql = 'SELECT id, tenant_id, name, email, role, level, skills, created_at FROM users';
    const params = [];
    if (tenant_id) { sql += ' WHERE tenant_id=?'; params.push(tenant_id); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    return db.prepare(sql).all(...params, Number(limit)).map((u) => ({ ...u, skills: JSON.parse(u.skills || '[]') }));
  }
}

export default new AuthService();
