import test from 'node:test';
import assert from 'node:assert/strict';
import federationService from '../src/services/meshFederationService.js';
import db from '../src/services/db.js';

function clean() {
  db.exec(`DELETE FROM mesh_federation_dispatches; DELETE FROM mesh_federation_peers;`);
}

test('buildLocalCard: produces HMAC-signed card', () => {
  clean();
  const card = federationService.buildLocalCard('tenant-1', 'https://a.example.com', 'Tenant A', ['rag', 'triage']);
  assert.equal(card.tenant_id, 'tenant-1');
  assert.equal(card.url, 'https://a.example.com');
  assert.deepEqual(card.capabilities, ['rag', 'triage']);
  assert.ok(card.signature);
  assert.equal(card.signature.length, 64); // sha256 hex
});

test('verifyCard: accepts valid card, rejects tampered', () => {
  clean();
  const card = federationService.buildLocalCard('t1', 'https://x', 'X', ['a']);
  assert.equal(federationService.verifyCard(card), true);
  const tampered = { ...card, name: 'Y' };
  assert.equal(federationService.verifyCard(tampered), false);
});

test('registerPeer: rejects missing required fields', () => {
  clean();
  assert.equal(federationService.registerPeer('t1', {}).success, false);
  assert.equal(federationService.registerPeer('t1', { peerUrl: 'u' }).success, false);
});

test('registerPeer: rejects invalid trust level', () => {
  clean();
  const r = federationService.registerPeer('t1', { peerUrl: 'https://x', peerName: 'X', trustLevel: 'super-trusted' });
  assert.equal(r.success, false);
  assert.match(r.error, /trustLevel/);
});

test('registerPeer: creates peer and lists it', () => {
  clean();
  const r = federationService.registerPeer('t1', {
    peerUrl: 'https://peer.example.com', peerName: 'Peer Co',
    peerTenantId: 'p1', trustLevel: 'verified', sharedCapabilities: ['rag', 'triage']
  });
  assert.equal(r.success, true);
  const list = federationService.listPeers('t1');
  assert.equal(list.length, 1);
  assert.equal(list[0].peer_name, 'Peer Co');
  assert.deepEqual(list[0].shared_capabilities, ['rag', 'triage']);
});

test('registerPeer: rejects duplicate peer URL for same tenant', () => {
  clean();
  federationService.registerPeer('t1', { peerUrl: 'https://dup', peerName: 'A' });
  const r2 = federationService.registerPeer('t1', { peerUrl: 'https://dup', peerName: 'B' });
  assert.equal(r2.success, false);
  assert.match(r2.error, /already registered/);
});

test('trustPeer: promotes trust level', () => {
  clean();
  const r = federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A' });
  const tr = federationService.trustPeer(r.peer.id, 'trusted');
  assert.equal(tr.success, true);
  assert.equal(tr.peer.trust_level, 'trusted');
});

test('removePeer: marks peer as removed (soft delete)', () => {
  clean();
  const r = federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A' });
  const rem = federationService.removePeer(r.peer.id);
  assert.equal(rem.success, true);
  assert.equal(federationService.listPeers('t1').length, 0);
});

test('recordDispatch + completeDispatch: round-trip status update', () => {
  clean();
  const r = federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A' });
  const d = federationService.recordDispatch({
    fromTenantId: 't1', toPeerId: r.peer.id, agentId: 'agent-1', payload: { task: 'triage' }
  });
  assert.equal(d.status, 'pending');
  const done = federationService.completeDispatch(d.id, { ok: true, result: 'triaged' }, 'completed');
  assert.equal(done.status, 'completed');
  const list = federationService.listDispatches('t1');
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].result, { ok: true, result: 'triaged' });
  assert.deepEqual(list[0].payload, { task: 'triage' });
});

test('completeDispatch: rejects invalid status', () => {
  clean();
  const r = federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A' });
  const d = federationService.recordDispatch({ fromTenantId: 't1', toPeerId: r.peer.id, agentId: 'a', payload: {} });
  assert.throws(() => federationService.completeDispatch(d.id, {}, 'weird'));
});

test('listDispatches: filters by status', () => {
  clean();
  const r = federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A' });
  const d1 = federationService.recordDispatch({ fromTenantId: 't1', toPeerId: r.peer.id, agentId: 'a', payload: {} });
  const d2 = federationService.recordDispatch({ fromTenantId: 't1', toPeerId: r.peer.id, agentId: 'b', payload: {} });
  federationService.completeDispatch(d2.id, {}, 'completed');
  assert.equal(federationService.listDispatches('t1', { status: 'pending' }).length, 1);
  assert.equal(federationService.listDispatches('t1', { status: 'completed' }).length, 1);
});

test('findPeerWithCapability: matches first trusted peer with capability', () => {
  clean();
  federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A', trustLevel: 'unverified', sharedCapabilities: ['rag'] });
  const r = federationService.registerPeer('t1', { peerUrl: 'https://b', peerName: 'B', trustLevel: 'trusted', sharedCapabilities: ['triage'] });
  const found = federationService.findPeerWithCapability('t1', 'triage');
  assert.ok(found);
  assert.equal(found.peer_name, 'B');
});

test('findPeerWithCapability: returns null when no peer has capability', () => {
  clean();
  federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A', trustLevel: 'trusted', sharedCapabilities: ['rag'] });
  assert.equal(federationService.findPeerWithCapability('t1', 'unknown'), null);
});

test('stats: aggregates peer and dispatch counts', () => {
  clean();
  const r1 = federationService.registerPeer('t1', { peerUrl: 'https://a', peerName: 'A' });
  const r2 = federationService.registerPeer('t1', { peerUrl: 'https://b', peerName: 'B', trustLevel: 'trusted' });
  federationService.recordDispatch({ fromTenantId: 't1', toPeerId: r1.peer.id, agentId: 'a', payload: {} });
  const s = federationService.stats('t1');
  assert.equal(s.peers, 2);
  assert.equal(s.trusted_peers, 1);
  assert.equal(s.total_dispatches, 1);
  assert.equal(s.pending_dispatches, 1);
});
