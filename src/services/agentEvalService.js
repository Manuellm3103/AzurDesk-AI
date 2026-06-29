import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';
import aaasGateway from './aaasGatewayService.js';

// Agent Eval Suite: benchmark agent intents against golden dataset.
class AgentEvalService {
  addCase({ tenant_id, intent, payload, expected_keys = [], expected_value = null }) {
    const id = randomUUID();
    db.prepare(`INSERT INTO agent_eval_cases (id, tenant_id, intent, payload, expected_keys, expected_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, tenant_id, intent, JSON.stringify(payload || {}), JSON.stringify(expected_keys || []), expected_value, now());
    return { id, tenant_id, intent, expected_keys, expected_value };
  }

  listCases(tenant_id) {
    return db.prepare(`SELECT * FROM agent_eval_cases WHERE tenant_id = ? ORDER BY created_at DESC`).all(tenant_id).map(r => ({
      ...r,
      payload: JSON.parse(r.payload || '{}'),
      expected_keys: JSON.parse(r.expected_keys || '[]')
    }));
  }

  async runEval(tenant_id, case_id) {
    const c = db.prepare(`SELECT * FROM agent_eval_cases WHERE id = ? AND tenant_id = ?`).get(case_id, tenant_id);
    if (!c) return { success: false, error: 'case not found' };
    const payload = JSON.parse(c.payload || '{}');
    const start = Date.now();
    const result = await aaasGateway.invoke(tenant_id, { intent: c.intent, payload });
    const duration_ms = Date.now() - start;
    const missing = (JSON.parse(c.expected_keys || '[]')).filter(k => !this.hasKey(result, k));
    const passed = result.success && missing.length === 0 && (c.expected_value === null || JSON.stringify(result.output || {}).includes(c.expected_value));
    const eval_id = randomUUID();
    db.prepare(`INSERT INTO agent_eval_runs (id, tenant_id, case_id, intent, passed, result, duration_ms, missing_keys, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(eval_id, tenant_id, case_id, c.intent, passed ? 1 : 0, JSON.stringify(result), duration_ms, JSON.stringify(missing), now());
    return { success: true, eval_id, passed, missing, duration_ms, result };
  }

  hasKey(obj, key) {
    const str = JSON.stringify(obj);
    return str.includes(`"${key}"`) || str.includes(`${key}`);
  }
}

export default new AgentEvalService();
