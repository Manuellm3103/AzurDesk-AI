import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson } from './_utils.js';

class AgentHarnessService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_skills (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        agent_id TEXT,
        name TEXT,
        description TEXT,
        params TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS agent_schedules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        agent_id TEXT,
        name TEXT,
        cron TEXT,
        goal TEXT,
        next_run TEXT,
        last_run TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS agent_sandbox_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        agent_id TEXT,
        command TEXT,
        stdout TEXT,
        stderr TEXT,
        exit_code INTEGER,
        created_at TEXT
      );
    `);
  }

  registerSkill(tenant_id, { agent_id, name, description, params = [] }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO agent_skills (id, tenant_id, agent_id, name, description, params, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, agent_id || null, name, description, JSON.stringify(params), 1, now(), now());
    return { id, tenant_id, agent_id, name };
  }

  listSkills(tenant_id, agent_id = null) {
    this.ensureTables();
    let sql = 'SELECT * FROM agent_skills WHERE tenant_id=?';
    const params = [tenant_id];
    if (agent_id) { sql += ' AND agent_id=?'; params.push(agent_id); }
    return db.prepare(sql).all(...params);
  }

  schedule(tenant_id, { agent_id, name, cron, goal }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO agent_schedules (id, tenant_id, agent_id, name, cron, goal, next_run, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, agent_id, name, cron, goal, now(), 1, now(), now());
    return { id, tenant_id, agent_id, name, cron, goal };
  }

  listSchedules(tenant_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM agent_schedules WHERE tenant_id=? ORDER BY next_run').all(tenant_id);
  }

  async runSandbox(tenant_id, agent_id, command, timeoutMs = 5000) {
    this.ensureTables();
    const id = randomUUID();
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execP = promisify(execFile);
    let result = { stdout: '', stderr: '', exit_code: -1 };
    try {
      const r = await execP('cmd', ['/c', command], { timeout: timeoutMs, windowsHide: true });
      result = { stdout: r.stdout || '', stderr: r.stderr || '', exit_code: 0 };
    } catch (e) {
      result = { stdout: e.stdout || '', stderr: e.stderr || e.message, exit_code: e.code || 1 };
    }
    db.prepare('INSERT INTO agent_sandbox_runs (id, tenant_id, agent_id, command, stdout, stderr, exit_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, agent_id, command, result.stdout, result.stderr, result.exit_code, now());
    return { id, ...result };
  }
}

export default new AgentHarnessService();
