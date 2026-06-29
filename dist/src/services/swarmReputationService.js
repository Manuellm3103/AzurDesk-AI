import db from './db.js';

export function electLeader(tenant_id, channel) {
  const row = db.prepare('SELECT from_agent, COUNT(*) as c FROM agent_messages WHERE tenant_id=? AND channel=? GROUP BY from_agent ORDER BY c DESC LIMIT 1').get(tenant_id, channel);
  return row ? row.from_agent : null;
}

export function getReputation(tenant_id, agent_id) {
  const sent = db.prepare('SELECT COUNT(*) as c FROM agent_messages WHERE tenant_id=? AND from_agent=?').get(tenant_id, agent_id).c || 0;
  const claims = db.prepare("SELECT COUNT(*) as c FROM agent_claims WHERE tenant_id=? AND agent_id=? AND status='completed'").get(tenant_id, agent_id).c || 0;
  return { sent, claims, score: Math.min(1, (claims + 1) / (sent + 1)) };
}

export default { electLeader, getReputation };
