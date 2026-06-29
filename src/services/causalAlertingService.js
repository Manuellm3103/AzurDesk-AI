import { randomUUID } from 'crypto';
import db from './db.js';
import { now } from './_utils.js';

// Causal alerting: z-score anomaly detection plus simple correlation by source.

function computeBaseline(tenant_id, metric, source, { windowMinutes = 60 } = {}) {
  const cutoff = new Date(Date.now() - windowMinutes * 60000).toISOString();
  // Use all recent values including noisy ones to build a stable baseline.
  const rows = db.prepare(`SELECT current_value FROM causal_alerts
                           WHERE tenant_id = ? AND metric = ? AND source = ? AND created_at > ?
                           ORDER BY created_at DESC LIMIT 100`).all(tenant_id, metric, source, cutoff);
  const values = rows.map(r => r.current_value);
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

function ingestMetric(tenant_id, { metric, source, value }) {
  if (!tenant_id || !metric || !source || value == null) throw new Error('tenant_id, metric, source, value required');
  const baseline = computeBaseline(tenant_id, metric, source) || { mean: value, stddev: 0 };
  const stddev = baseline.stddev || 1e-9;
  const z = (value - baseline.mean) / stddev;
  const severity = Math.abs(z) >= 4 ? 'critical' : Math.abs(z) >= 2.5 ? 'warning' : 'info';
  const alertId = randomUUID();
  const created = now();
  let reason = `z-score ${z.toFixed(2)} vs baseline ${baseline.mean.toFixed(2)} (stddev ${stddev.toFixed(2)})`;
  let status = 'open';
  // If z-score is small, still store as closed/noise baseline point.
  if (Math.abs(z) < 1.5) {
    status = 'noisy';
    reason = 'within normal range';
  }
  db.prepare(`INSERT INTO causal_alerts (id, tenant_id, metric, source, current_value, baseline_value, stddev, z_score, reason, severity, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(alertId, tenant_id, metric, source, value, baseline.mean, stddev, z, reason, severity, status, created, created);
  const alert = getAlert(alertId);
  if (status === 'open') correlateAlert(alert);
  return alert;
}

function getAlert(id) {
  const row = db.prepare('SELECT * FROM causal_alerts WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, current_value: row.current_value, baseline_value: row.baseline_value };
}

function listAlerts(tenant_id, { status, severity, limit = 50 } = {}) {
  let sql = 'SELECT * FROM causal_alerts WHERE tenant_id = ?';
  const params = [tenant_id];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (severity) { sql += ' AND severity = ?'; params.push(severity); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

function correlateAlert(alert) {
  // Simple correlation: find other sources of the same metric within the last 5 min.
  const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
  const peers = db.prepare(`SELECT source, z_score FROM causal_alerts
                            WHERE tenant_id = ? AND metric = ? AND source != ? AND created_at > ? AND status = 'open'
                            ORDER BY ABS(z_score) DESC LIMIT 10`)
    .all(alert.tenant_id, alert.metric, alert.source, cutoff);
  for (const peer of peers) {
    const score = Math.min(Math.abs(peer.z_score) / (Math.abs(alert.z_score) || 1), 1.0);
    db.prepare(`INSERT INTO causal_alert_correlations (id, alert_id, related_source, correlation_score, reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), alert.id, peer.source, score, `peer anomaly on ${alert.metric}`, now());
  }
}

function getCorrelations(alert_id) {
  return db.prepare('SELECT * FROM causal_alert_correlations WHERE alert_id = ? ORDER BY correlation_score DESC').all(alert_id);
}

function updateAlertStatus(id, tenant_id, status) {
  const info = db.prepare('UPDATE causal_alerts SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .run(status, now(), id, tenant_id);
  return info.changes > 0 ? getAlert(id) : null;
}

export default { ingestMetric, getAlert, listAlerts, getCorrelations, updateAlertStatus, computeBaseline };
export { ingestMetric, getAlert, listAlerts, getCorrelations, updateAlertStatus, computeBaseline };
