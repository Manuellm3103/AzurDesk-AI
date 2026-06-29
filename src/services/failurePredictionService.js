import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';

// Lightweight local failure-prediction engine.
// Uses a weighted score model based on signals. No external deps.
const WEIGHTS = {
  error_rate: 0.25,
  latency_p95: 0.20,
  open_tickets: 0.20,
  overdue_ratio: 0.15,
  sentiment_negative: 0.20
};

const ACTIONS = {
  low: 'monitorear',
  medium: 'alertar_equipo',
  high: 'escalar_manual',
  critical: 'remediar_automatico'
};

const THRESHOLDS = { low: 0.30, medium: 0.55, high: 0.75, critical: 0.90 };

const failurePredictionService = {
  ensureTables() {
    // Tables created via migrations in db.js.
  },

  recordSignal(tenant_id, { signal_type, entity_type, entity_id, value, threshold, raw }) {
    this.ensureTables();
    const id = randomUUID();
    const created = now();
    db.prepare(`INSERT INTO failure_signals (id, tenant_id, signal_type, entity_type, entity_id, value, threshold, raw, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tenant_id, signal_type, entity_type, entity_id, value, threshold ?? 0, raw ? JSON.stringify(raw) : null, created);
    return { id, tenant_id, signal_type, entity_type, entity_id, value, created_at: created };
  },

  listSignals(tenant_id, { signal_type, entity_type, entity_id, limit = 100 } = {}) {
    this.ensureTables();
    let sql = `SELECT * FROM failure_signals WHERE tenant_id = ?`;
    const args = [tenant_id];
    if (signal_type) { sql += ` AND signal_type = ?`; args.push(signal_type); }
    if (entity_type) { sql += ` AND entity_type = ?`; args.push(entity_type); }
    if (entity_id) { sql += ` AND entity_id = ?`; args.push(entity_id); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(limit);
    return db.prepare(sql).all(...args);
  },

  predict(tenant_id, entity_type, entity_id, signals = []) {
    this.ensureTables();
    // Normalize each signal to 0..1 using threshold as 0.75 reference.
    let weightedSum = 0;
    let totalWeight = 0;
    const used = [];
    for (const s of signals) {
      const w = WEIGHTS[s.signal_type] || 0.1;
      const norm = s.threshold ? Math.min(s.value / s.threshold, 1.5) / 1.5 : Math.min(s.value, 1);
      weightedSum += norm * w;
      totalWeight += w;
      used.push({ ...s, normalized: norm, weight: w });
    }
    const baseScore = totalWeight ? weightedSum / totalWeight : 0;
    // Boost if multiple signal types fire above 0.7.
    const highSignals = used.filter(u => u.normalized >= 0.7).length;
    const risk_score = Math.min(1, baseScore * (1 + highSignals * 0.08));

    let level = 'low';
    if (risk_score >= THRESHOLDS.critical) level = 'critical';
    else if (risk_score >= THRESHOLDS.high) level = 'high';
    else if (risk_score >= THRESHOLDS.medium) level = 'medium';

    const confidence = used.length ? Math.min(0.98, 0.5 + used.length * 0.1 + highSignals * 0.05) : 0;

    const id = randomUUID();
    const created = now();
    db.prepare(`INSERT INTO failure_predictions
      (id, tenant_id, entity_type, entity_id, risk_score, signals, recommended_action, confidence, status, triggered_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tenant_id, entity_type, entity_id, risk_score, JSON.stringify(used), ACTIONS[level], confidence, level, created, created);

    return {
      id, tenant_id, entity_type, entity_id, risk_score,
      recommended_action: ACTIONS[level], confidence, status: level,
      signals: used, triggered_at: created
    };
  },

  listPredictions(tenant_id, { entity_type, status, min_risk = 0, limit = 100 } = {}) {
    this.ensureTables();
    let sql = `SELECT * FROM failure_predictions WHERE tenant_id = ? AND risk_score >= ?`;
    const args = [tenant_id, min_risk];
    if (entity_type) { sql += ` AND entity_type = ?`; args.push(entity_type); }
    if (status) { sql += ` AND status = ?`; args.push(status); }
    sql += ` ORDER BY risk_score DESC, created_at DESC LIMIT ?`;
    args.push(limit);
    const rows = db.prepare(sql).all(...args);
    return rows.map(r => ({ ...r, signals: JSON.parse(r.signals || '[]') }));
  },

  getPrediction(tenant_id, id) {
    this.ensureTables();
    const row = db.prepare(`SELECT * FROM failure_predictions WHERE tenant_id = ? AND id = ?`).get(tenant_id, id);
    if (!row) return null;
    return { ...row, signals: JSON.parse(row.signals || '[]') };
  },

  updatePrediction(tenant_id, id, { status, resolved_at }) {
    this.ensureTables();
    const row = db.prepare(`SELECT * FROM failure_predictions WHERE tenant_id = ? AND id = ?`).get(tenant_id, id);
    if (!row) return false;
    db.prepare(`UPDATE failure_predictions SET status = ?, triggered_at = ? WHERE tenant_id = ? AND id = ?`)
      .run(status ?? row.status, resolved_at ?? row.triggered_at, tenant_id, id);
    return true;
  },

  // Helper: auto-scan a tenant using available signals.
  scanTenant(tenant_id) {
    this.ensureTables();
    const signals = [];
    const openTickets = db.prepare(`SELECT COUNT(*) as n FROM tickets WHERE tenant_id = ? AND status != 'closed'`).get(tenant_id).n;
    const overdueTickets = db.prepare(`SELECT COUNT(*) as n FROM tickets WHERE tenant_id = ? AND status != 'closed' AND due_at < ?`).get(tenant_id, now()).n;
    const totalTickets = db.prepare(`SELECT COUNT(*) as n FROM tickets WHERE tenant_id = ? AND created_at > datetime('now','-7 days')`).get(tenant_id).n;

    if (openTickets) signals.push({ signal_type: 'open_tickets', entity_type: 'tenant', entity_id: tenant_id, value: Math.min(openTickets / 50, 1), threshold: 1 });
    if (overdueTickets) signals.push({ signal_type: 'overdue_ratio', entity_type: 'tenant', entity_id: tenant_id, value: openTickets ? overdueTickets / openTickets : 0, threshold: 0.25 });
    if (totalTickets) signals.push({ signal_type: 'error_rate', entity_type: 'tenant', entity_id: tenant_id, value: Math.min(totalTickets / 200, 1), threshold: 1 });

    // Recent error-like signals.
    const recentErrors = db.prepare(`SELECT COUNT(*) as n FROM failure_signals WHERE tenant_id = ? AND signal_type = 'error_rate' AND created_at > datetime('now','-1 hour')`).get(tenant_id).n;
    if (recentErrors) signals.push({ signal_type: 'error_rate', entity_type: 'tenant', entity_id: tenant_id, value: Math.min(recentErrors / 20, 1), threshold: 1 });

    return this.predict(tenant_id, 'tenant', tenant_id, signals);
  }
};

export default failurePredictionService;
