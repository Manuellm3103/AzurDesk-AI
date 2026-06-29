import db from './db.js';
import { now, safeJson } from './_utils.js';
import { randomUUID } from 'crypto';

class GuardrailsService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS guardrails (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        scope TEXT,
        pattern TEXT,
        action TEXT,
        message TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_guardrails_tenant ON guardrails (tenant_id, scope);
    `);
  }

  defaultRules(tenant_id) {
    return [
      { name: 'No PII leakage', scope: 'output', pattern: '(\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b|\\b\\d{3}-\\d{2}-\\d{4}\\b)', action: 'redact', message: 'Posible PII detectado y redactado' },
      { name: 'No prompt injection', scope: 'input', pattern: '(ignore previous instructions|system prompt|you are now|DAN|jailbreak)', action: 'block', message: 'Prompt injection detectado' },
      { name: 'No secrets', scope: 'output', pattern: '(api[_-]?key|apikey|token|password|secret)\s*[:=]\s*["\']?[A-Za-z0-9_\-]{16,}["\']?', action: 'block', message: 'Posible secreto detectado' },
      { name: 'Toxicity filter', scope: 'output', pattern: '(idiota|estúpido|imbécil|tonto|maldito)', action: 'block', message: 'Lenguaje inapropiado detectado' }
    ].map(r => this.createRule(tenant_id, r));
  }

  createRule(tenant_id, { name, scope, pattern, action = 'block', message = '' }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO guardrails (id, tenant_id, name, scope, pattern, action, message, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, name, scope, pattern, action, message, 1, now(), now());
    return { id, tenant_id, name, scope, pattern, action, message };
  }

  listRules(tenant_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM guardrails WHERE tenant_id=?').all(tenant_id);
  }

  check(tenant_id, scope, text) {
    const rules = this.listRules(tenant_id).filter(r => r.scope === scope && r.enabled);
    for (const rule of rules) {
      try {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(text)) {
          return { ok: false, rule, action: rule.action, message: rule.message };
        }
      } catch (e) {
        // invalid regex, skip
      }
    }
    return { ok: true };
  }
}

export default new GuardrailsService();
