import db from './db.js';
import { now } from './_utils.js';
import { randomUUID } from 'crypto';

// OpenTelemetry-lite + self-healing loop: record health signals and auto-remediate failed agents/runs
class SelfHealingService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS otel_spans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        trace_id TEXT,
        span_id TEXT,
        parent_id TEXT,
        service TEXT,
        operation TEXT,
        status TEXT,
        meta TEXT,
        started_at TEXT,
        ended_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_otel_trace ON otel_spans (trace_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_otel_service ON otel_spans (tenant_id, service, status);

      CREATE TABLE IF NOT EXISTS healing_actions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        target_type TEXT,
        target_id TEXT,
        symptom TEXT,
        action TEXT,
        result TEXT,
        created_at TEXT
      );
    `);
  }

  startSpan(tenant_id, { trace_id, span_id, parent_id, service, operation, meta = {} }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO otel_spans (id, tenant_id, trace_id, span_id, parent_id, service, operation, status, meta, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, trace_id, span_id, parent_id || null, service, operation, 'ok', JSON.stringify(meta), now(), null);
    return { id, trace_id, span_id, service, operation };
  }

  endSpan(id, { status = 'ok', meta = {} } = {}) {
    this.ensureTables();
    db.prepare('UPDATE otel_spans SET status=?, meta=json_set(meta, \'$.result\', json(?)), ended_at=? WHERE id=?')
      .run(status, JSON.stringify(meta), now(), id);
    return { id, status };
  }

  getTrace(trace_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM otel_spans WHERE trace_id=? ORDER BY started_at ASC').all(trace_id)
      .map(r => ({ ...r, meta: JSON.parse(r.meta || '{}') }));
  }

  // Detect failed spans and emit healing action
  detectAndHeal(tenant_id) {
    this.ensureTables();
    const failures = db.prepare("SELECT * FROM otel_spans WHERE tenant_id=? AND status='error' AND ended_at > datetime('now', '-5 minutes') ORDER BY started_at DESC LIMIT 10").all(tenant_id);
    const actions = [];
    for (const f of failures) {
      const action = this._decideHealing(f);
      if (action) {
        db.prepare('INSERT INTO healing_actions (id, tenant_id, target_type, target_id, symptom, action, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(randomUUID(), tenant_id, f.service, f.span_id, f.operation, action, JSON.stringify({ applied: true }), now());
        actions.push({ target: f.service, action });
      }
    }
    return actions;
  }

  _decideHealing(span) {
    if (span.service === 'aaas-router' && span.operation === 'generate') return 'fallback_to_local_llm';
    if (span.service === 'swarm-agent' && span.operation === 'claim') return 'reassign_task';
    if (span.service === 'cua-agent' && span.operation === 'act') return 'retry_with_screenshot';
    if (span.service === 'durable-workflow' && span.operation === 'step') return 'retry_step_backoff';
    return 'alert_operator';
  }

  listHealing(tenant_id, limit = 50) {
    this.ensureTables();
    return db.prepare('SELECT * FROM healing_actions WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, limit)
      .map(r => ({ ...r, result: JSON.parse(r.result || '{}') }));
  }

  status() {
    this.ensureTables();
    return {
      spans_total: db.prepare('SELECT COUNT(*) as c FROM otel_spans').get().c,
      spans_error: db.prepare("SELECT COUNT(*) as c FROM otel_spans WHERE status='error'").get().c,
      healing_actions: db.prepare('SELECT COUNT(*) as c FROM healing_actions').get().c
    };
  }
}

export default new SelfHealingService();
