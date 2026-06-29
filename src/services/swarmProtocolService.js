import { randomUUID } from 'crypto';
import db from './db.js';
import { now } from './_utils.js';
import swarmReputation from './swarmReputationService.js';

class SwarmProtocolService {
  // Coordination protocol inspired by https://github.com/phuryn/swarm-protocol
  getTeamStatus(tenant_id) {
    const active = db.prepare('SELECT c.*, a.name as agent_name FROM agent_claims c JOIN agents a ON c.agent_id = a.id WHERE c.tenant_id = ? AND c.status = \'active\' ORDER BY c.heartbeat_at DESC').all(tenant_id);
    const idle = db.prepare('SELECT id, name, role, level FROM agents WHERE tenant_id = ? AND status = \'idle\' ORDER BY level').all(tenant_id);
    return { active_claims: active, idle_agents: idle };
  }

  claimWork(tenant_id, agent_id, task_id, task_type, files = []) {
    const existing = db.prepare('SELECT id FROM agent_claims WHERE tenant_id = ? AND task_id = ? AND status = \'active\' LIMIT 1').get(tenant_id, task_id);
    if (existing) throw new Error(`Task ${task_id} already claimed`);
    const id = randomUUID();
    db.prepare('INSERT INTO agent_claims (id, tenant_id, agent_id, task_id, task_type, status, files, heartbeat_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, agent_id, task_id, task_type, 'active', JSON.stringify(files), now(), now());
    db.prepare('UPDATE agents SET status = ?, current_task_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?')
      .run('busy', task_id, now(), tenant_id, agent_id);
    return this.getClaim(tenant_id, id);
  }

  heartbeat(tenant_id, claim_id) {
    db.prepare('UPDATE agent_claims SET heartbeat_at = ? WHERE tenant_id = ? AND id = ?').run(now(), tenant_id, claim_id);
    return this.getClaim(tenant_id, claim_id);
  }

  completeClaim(tenant_id, claim_id, unblocks = []) {
    db.prepare('UPDATE agent_claims SET status = ?, heartbeat_at = ? WHERE tenant_id = ? AND id = ?').run('completed', now(), tenant_id, claim_id);
    const claim = this.getClaim(tenant_id, claim_id);
    db.prepare('UPDATE agents SET status = ?, current_task_id = NULL, updated_at = ? WHERE tenant_id = ? AND id = ?')
      .run('idle', now(), tenant_id, claim.agent_id);
    for (const taskId of unblocks) {
      db.prepare('UPDATE agent_claims SET status = ? WHERE tenant_id = ? AND task_id = ?').run('active', tenant_id, taskId);
    }
    return claim;
  }

  checkConflicts(tenant_id, files) {
    const placeholders = files.map(() => '?').join(',');
    const conflicts = db.prepare(`SELECT c.*, a.name as agent_name FROM agent_claims c JOIN agents a ON c.agent_id = a.id WHERE c.tenant_id = ? AND c.status = \'active\' AND (c.files LIKE '%' || ? || '%'${files.length > 1 ? ' OR c.files LIKE \'%\' || ? || \'%\''.repeat(files.length - 1) : ''})`).all(tenant_id, ...files);
    return conflicts;
  }

  getClaim(tenant_id, id) {
    return db.prepare('SELECT * FROM agent_claims WHERE tenant_id = ? AND id = ?').get(tenant_id, id);
  }

  sendMessage(tenant_id, { from_agent, to_agent, channel = 'general', body }) {
    const id = randomUUID();
    db.prepare('INSERT INTO agent_messages (id, tenant_id, from_agent, to_agent, channel, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, from_agent, to_agent || null, channel, body, now());
    return { id, from_agent, to_agent, channel, body };
  }

  getMessages(tenant_id, { channel, to_agent, limit = 50 } = {}) {
    let sql = 'SELECT * FROM agent_messages WHERE tenant_id = ?';
    const params = [tenant_id];
    if (channel) { sql += ' AND channel = ?'; params.push(channel); }
    if (to_agent) { sql += ' AND (to_agent = ? OR to_agent IS NULL)'; params.push(to_agent); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return db.prepare(sql).all(...params);
  }

  electLeader(tenant_id, channel) {
    return swarmReputation.electLeader(tenant_id, channel);
  }

  getReputation(tenant_id, agent_id) {
    return swarmReputation.getReputation(tenant_id, agent_id);
  }
}

export default new SwarmProtocolService();
