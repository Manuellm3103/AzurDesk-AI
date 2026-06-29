import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/services/db.js';
import swarmProtocolService from '../src/services/swarmProtocolService.js';

test('swarm reputation y leader election', () => {
  db.prepare('DELETE FROM agent_messages').run();
  db.prepare('DELETE FROM agent_claims').run();
  db.prepare('INSERT OR IGNORE INTO agents (id, tenant_id, name, role, level, status) VALUES (?, ?, ?, ?, ?, ?)').run('alice', 'sw1', 'Alice', 'tech', 2, 'idle');
  swarmProtocolService.sendMessage('sw1', { from_agent: 'alice', to_agent: 'bob', channel: 'general', body: 'hola' });
  swarmProtocolService.sendMessage('sw1', { from_agent: 'alice', to_agent: 'bob', channel: 'general', body: 'tarea' });
  const rep = swarmProtocolService.getReputation('sw1', 'alice');
  assert.ok(rep.sent >= 2);
  const leader = swarmProtocolService.electLeader('sw1', 'general');
  assert.equal(leader, 'alice');
});
