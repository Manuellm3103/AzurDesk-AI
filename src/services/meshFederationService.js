// Agent Mesh Federation — peer-to-peer agent sharing across tenants/domains.
// Inspired by Matrix's federated rooms and signed agent cards (A2A spec).
// Each AzurDesk instance publishes a signed "federation card" with its
// agent roster. Peers exchange cards, verify signatures, and can dispatch
// tasks to remote agents when local mesh lacks the capability.
//
// Schema (mesh_federation_peers):
//   id, local_tenant_id, peer_url, peer_name, peer_tenant_id,
//   trust_level (unverified|verified|trusted), public_key,
//   shared_capabilities (JSON), last_seen, status, created_at
// Schema (mesh_federation_dispatches):
//   id, from_tenant_id, to_peer_id, agent_id, payload (JSON),
//   result (JSON), status (pending|completed|failed|expired), created_at, completed_at

import { randomUUID, createHmac, createHash } from 'crypto';
import db from './db.js';
import { now } from './_utils.js';

const FEDERATION_SECRET = process.env.FEDERATION_SECRET || 'azurdesk-federation-dev-secret';

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mesh_federation_peers (
      id TEXT PRIMARY KEY,
      local_tenant_id TEXT NOT NULL,
      peer_url TEXT NOT NULL,
      peer_name TEXT NOT NULL,
      peer_tenant_id TEXT,
      trust_level TEXT NOT NULL DEFAULT 'unverified',
      public_key TEXT,
      shared_capabilities TEXT,
      last_seen TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE(local_tenant_id, peer_url)
    );
    CREATE INDEX IF NOT EXISTS idx_mesh_fed_peers_local ON mesh_federation_peers (local_tenant_id);

    CREATE TABLE IF NOT EXISTS mesh_federation_dispatches (
      id TEXT PRIMARY KEY,
      from_tenant_id TEXT NOT NULL,
      to_peer_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      signature TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mesh_fed_dispatch_from ON mesh_federation_dispatches (from_tenant_id, status);
  `);
}

function signCard(card) {
  const payload = `${card.tenant_id}|${card.url}|${card.name}|${(card.capabilities || []).join(',')}`;
  return createHmac('sha256', FEDERATION_SECRET).update(payload).digest('hex');
}

function verifyCardSignature(card) {
  const expected = signCard(card);
  return card.signature === expected;
}

class FederationService {
  constructor() { ensureTables(); }

  // Build a local federation card for a given tenant
  buildLocalCard(local_tenant_id, baseUrl, name, capabilities = []) {
    ensureTables();
    const card = {
      tenant_id: local_tenant_id,
      url: baseUrl,
      name,
      capabilities,
      version: '1.0.0',
      issued_at: now()
    };
    card.signature = signCard(card);
    return card;
  }

  verifyCard(card) {
    return verifyCardSignature(card);
  }

  registerPeer(local_tenant_id, { peerUrl, peerName, peerTenantId, trustLevel = 'unverified', publicKey, sharedCapabilities }) {
    ensureTables();
    if (!peerUrl || !peerName) return { success: false, error: 'peerUrl and peerName are required' };
    if (!['unverified', 'verified', 'trusted'].includes(trustLevel)) {
      return { success: false, error: 'trustLevel must be unverified|verified|trusted' };
    }
    const id = randomUUID();
    try {
      db.prepare(`INSERT INTO mesh_federation_peers (id, local_tenant_id, peer_url, peer_name, peer_tenant_id, trust_level, public_key, shared_capabilities, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
        .run(id, local_tenant_id, peerUrl, peerName, peerTenantId || null, trustLevel, publicKey || null, JSON.stringify(sharedCapabilities || []), now());
      return { success: true, peer: this.getPeer(id) };
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return { success: false, error: `Peer ${peerUrl} already registered for this tenant` };
      }
      return { success: false, error: e.message };
    }
  }

  listPeers(local_tenant_id) {
    ensureTables();
    return db.prepare('SELECT * FROM mesh_federation_peers WHERE local_tenant_id = ? AND status = \'active\' ORDER BY peer_name').all(local_tenant_id)
      .map((r) => ({ ...r, shared_capabilities: JSON.parse(r.shared_capabilities || '[]') }));
  }

  getPeer(id) {
    ensureTables();
    const r = db.prepare('SELECT * FROM mesh_federation_peers WHERE id = ?').get(id);
    if (!r) return null;
    return { ...r, shared_capabilities: JSON.parse(r.shared_capabilities || '[]') };
  }

  trustPeer(id, trustLevel) {
    ensureTables();
    if (!['unverified', 'verified', 'trusted'].includes(trustLevel)) {
      return { success: false, error: 'invalid trust level' };
    }
    db.prepare('UPDATE mesh_federation_peers SET trust_level = ?, last_seen = ? WHERE id = ?').run(trustLevel, now(), id);
    return { success: true, peer: this.getPeer(id) };
  }

  removePeer(id) {
    ensureTables();
    db.prepare('UPDATE mesh_federation_peers SET status = \'removed\' WHERE id = ?').run(id);
    return { success: true };
  }

  recordDispatch({ fromTenantId, toPeerId, agentId, payload, signature }) {
    ensureTables();
    const id = randomUUID();
    db.prepare(`INSERT INTO mesh_federation_dispatches (id, from_tenant_id, to_peer_id, agent_id, payload, status, created_at, signature) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .run(id, fromTenantId, toPeerId, agentId, JSON.stringify(payload || {}), now(), signature || null);
    return { id, status: 'pending', from_tenant_id: fromTenantId, to_peer_id: toPeerId, agent_id: agentId };
  }

  completeDispatch(id, result, status = 'completed') {
    ensureTables();
    if (!['completed', 'failed', 'expired'].includes(status)) {
      throw new Error('status must be completed|failed|expired');
    }
    db.prepare('UPDATE mesh_federation_dispatches SET result = ?, status = ?, completed_at = ? WHERE id = ?')
      .run(JSON.stringify(result || {}), status, now(), id);
    return { id, status };
  }

  listDispatches(fromTenantId, { status } = {}) {
    ensureTables();
    let sql = 'SELECT * FROM mesh_federation_dispatches WHERE from_tenant_id = ?';
    const args = [fromTenantId];
    if (status) { sql += ' AND status = ?'; args.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    return db.prepare(sql).all(...args).map((r) => ({
      ...r,
      payload: JSON.parse(r.payload || '{}'),
      result: r.result ? JSON.parse(r.result) : null
    }));
  }

  // Find best peer for a given agent capability requirement
  findPeerWithCapability(local_tenant_id, capability) {
    const peers = this.listPeers(local_tenant_id).filter((p) => p.trust_level !== 'unverified');
    for (const peer of peers) {
      if ((peer.shared_capabilities || []).includes(capability)) return peer;
    }
    return null;
  }

  stats(local_tenant_id) {
    ensureTables();
    const peers = db.prepare('SELECT COUNT(*) as c FROM mesh_federation_peers WHERE local_tenant_id = ? AND status = \'active\'').get(local_tenant_id).c;
    const trusted = db.prepare('SELECT COUNT(*) as c FROM mesh_federation_peers WHERE local_tenant_id = ? AND trust_level = \'trusted\' AND status = \'active\'').get(local_tenant_id).c;
    const dispatches = db.prepare('SELECT COUNT(*) as c FROM mesh_federation_dispatches WHERE from_tenant_id = ?').get(local_tenant_id).c;
    const pending = db.prepare('SELECT COUNT(*) as c FROM mesh_federation_dispatches WHERE from_tenant_id = ? AND status = \'pending\'').get(local_tenant_id).c;
    return { peers, trusted_peers: trusted, total_dispatches: dispatches, pending_dispatches: pending };
  }
}

export default new FederationService();
