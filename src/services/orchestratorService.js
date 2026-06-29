import db from '../services/db.js';
import { randomUUID } from 'crypto';
import { now, safeJson } from '../services/_utils.js';
import engramService from './engramService.js';

const STATES = ['DISCOVER', 'PLAN', 'IMPLEMENT', 'VERIFY', 'MERGE', 'DONE', 'FAILED'];

class OrchestratorService {
  constructor(database = db) {
    this.db = database;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orchestrator_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        user_id TEXT,
        goal TEXT,
        state TEXT DEFAULT 'DISCOVER',
        beads TEXT,
        evidence TEXT,
        quality_gate INTEGER,
        safety_gate INTEGER,
        token_gate INTEGER,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_orch_tenant ON orchestrator_runs (tenant_id);
    `);
  }

  start({ tenant_id, user_id, goal, beads = [] }) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO orchestrator_runs (id, tenant_id, user_id, goal, state, beads, evidence, quality_gate, safety_gate, token_gate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, user_id, goal, 'DISCOVER', JSON.stringify(beads), '{}', 0, 0, 0, now(), now());
    return { id, tenant_id, user_id, goal, state: 'DISCOVER', beads };
  }

  get(id, tenant_id) {
    const run = this.db.prepare('SELECT * FROM orchestrator_runs WHERE id=? AND tenant_id=?').get(id, tenant_id);
    if (run) run.beads = safeJson(run.beads, []);
    return run;
  }

  list(tenant_id, limit = 20) {
    const rows = this.db.prepare('SELECT * FROM orchestrator_runs WHERE tenant_id=? ORDER BY updated_at DESC LIMIT ?').all(tenant_id, limit);
    for (const r of rows) r.beads = safeJson(r.beads, []);
    return rows;
  }

  transition({ id, tenant_id, state, evidence = {}, gates = {}, beads }) {
    const run = this.get(id, tenant_id);
    if (!run) return null;
    if (!STATES.includes(state)) throw new Error('Estado inválido');
    const currentIdx = STATES.indexOf(run.state);
    const nextIdx = STATES.indexOf(state);
    if (nextIdx < currentIdx && state !== 'FAILED') throw new Error('No se permite retroceder en el loop');
    const ev = { ...safeJson(run.evidence, {}), ...evidence, [state]: { at: now(), ...evidence } };
    const beadJson = beads ? JSON.stringify(beads) : JSON.stringify(run.beads || []);
    this.db.prepare('UPDATE orchestrator_runs SET state=?, beads=?, evidence=?, quality_gate=?, safety_gate=?, token_gate=?, updated_at=? WHERE id=?')
      .run(state, beadJson, JSON.stringify(ev), gates.quality ? 1 : 0, gates.safety ? 1 : 0, gates.token ? 1 : 0, now(), id);
    if (state === 'DONE' || state === 'VERIFY' || state === 'FAILED') {
      engramService.remember({ tenant_id, user_id: run.user_id, content: `Goal ${run.goal}: state ${state}. Evidence: ${JSON.stringify(evidence)}`, type: 'agent_run', importance: state === 'DONE' ? 2 : 1.5, summary: `Run ${id} reached ${state}` });
    }
    return this.get(id, tenant_id);
  }

  advance(id, tenant_id, payload = {}) {
    const run = this.get(id, tenant_id);
    if (!run) return null;
    const idx = STATES.indexOf(run.state);
    if (idx >= 4) {
      // MERGE → DONE
      return this.transition({ id, tenant_id, state: 'DONE', evidence: payload.evidence, gates: payload.gates || {}, beads: payload.beads });
    }
    return this.transition({ id, tenant_id, state: STATES[idx + 1], evidence: payload.evidence, gates: payload.gates || {}, beads: payload.beads });
  }

  fail(id, tenant_id, reason) {
    return this.transition({ id, tenant_id, state: 'FAILED', evidence: { reason }, gates: {} });
  }
}

export default new OrchestratorService();
