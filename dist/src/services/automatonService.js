import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson } from './_utils.js';

// Automaton / Triggers: rule engine for tickets
class AutomatonService {
  constructor(database = db) {
    this.db = database;
  }

  list(tenant_id) {
    return { success: true, rules: this.db.prepare('SELECT * FROM automaton_rules WHERE tenant_id=? ORDER BY priority DESC, created_at ASC').all(tenant_id) };
  }

  get(tenant_id, id) {
    const r = this.db.prepare('SELECT * FROM automaton_rules WHERE tenant_id=? AND id=?').get(tenant_id, id);
    if (!r) return { success: false, error: 'Rule not found' };
    return { success: true, rule: r };
  }

  create(tenant_id, { name, description, condition, actions, priority = 0, enabled = 1 }) {
    const id = randomUUID();
    const t = now();
    this.db.prepare('INSERT INTO automaton_rules (id, tenant_id, name, description, condition, actions, enabled, priority, run_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .run(id, tenant_id, name, description || '', JSON.stringify(condition), JSON.stringify(actions), enabled ? 1 : 0, priority, t, t);
    return { success: true, rule: this.get(tenant_id, id).rule };
  }

  update(tenant_id, id, fields) {
    const existing = this.get(tenant_id, id);
    if (!existing.success) return existing;
    const r = existing.rule;
    const name = fields.name ?? r.name;
    const description = fields.description ?? r.description;
    const condition = fields.condition ? JSON.stringify(fields.condition) : r.condition;
    const actions = fields.actions ? JSON.stringify(fields.actions) : r.actions;
    const enabled = fields.enabled === undefined ? r.enabled : (fields.enabled ? 1 : 0);
    const priority = fields.priority ?? r.priority;
    this.db.prepare('UPDATE automaton_rules SET name=?, description=?, condition=?, actions=?, enabled=?, priority=?, updated_at=? WHERE tenant_id=? AND id=?')
      .run(name, description, condition, actions, enabled, priority, now(), tenant_id, id);
    return { success: true, rule: this.get(tenant_id, id).rule };
  }

  delete(tenant_id, id) {
    this.db.prepare('DELETE FROM automaton_rules WHERE tenant_id=? AND id=?').run(tenant_id, id);
    return { success: true };
  }

  evaluateRule(rule, ticket) {
    const cond = typeof rule.condition === 'string' ? safeJson(rule.condition, {}) : rule.condition;
    if (!cond || !Object.keys(cond).length) return false;
    for (const [key, expected] of Object.entries(cond)) {
      const value = ticket[key];
      if (expected !== undefined && value !== expected) return false;
    }
    return true;
  }

  run(tenant_id, ticket, actor = { id: 'automaton' }, singleRuleId = null) {
    const rules = singleRuleId
      ? this.db.prepare('SELECT * FROM automaton_rules WHERE tenant_id=? AND id=? AND enabled=1').all(tenant_id, singleRuleId)
      : this.db.prepare('SELECT * FROM automaton_rules WHERE tenant_id=? AND enabled=1 ORDER BY priority DESC').all(tenant_id);
    const executed = [];
    for (const rule of rules) {
      const matched = this.evaluateRule(rule, ticket);
      const actions = typeof rule.actions === 'string' ? safeJson(rule.actions, []) : rule.actions;
      const runId = randomUUID();
      if (!matched) {
        this.db.prepare('INSERT INTO automaton_runs (id, tenant_id, rule_id, ticket_id, matched, actions, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
          .run(runId, tenant_id, rule.id, ticket.id || null, JSON.stringify([]), now());
        continue;
      }
      const applied = [];
      for (const action of (actions || [])) {
        applied.push(this.executeAction(tenant_id, ticket, action, actor));
      }
      this.db.prepare('UPDATE automaton_rules SET run_count = run_count + 1, updated_at=? WHERE tenant_id=? AND id=?').run(now(), tenant_id, rule.id);
      this.db.prepare('INSERT INTO automaton_runs (id, tenant_id, rule_id, ticket_id, matched, actions, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
        .run(runId, tenant_id, rule.id, ticket.id || null, JSON.stringify(applied), now());
      executed.push({ rule_id: rule.id, name: rule.name, actions: applied });
    }
    return { success: true, executed };
  }

  executeAction(tenant_id, ticket, action, actor) {
    const { type, params = {} } = action;
    if (type === 'webhook') {
      this.db.prepare('INSERT INTO outbox (id, tenant_id, type, destination, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), tenant_id, 'webhook', params.url || '', JSON.stringify({ ticket, message: params.message || 'Automaton alert' }), 'pending', now());
      return { type, ok: true };
    }
    if (type === 'email') {
      this.db.prepare('INSERT INTO outbox (id, tenant_id, type, destination, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), tenant_id, 'email', params.to || '', JSON.stringify({ ticket, subject: params.subject || 'Automaton alert', body: params.body || '' }), 'pending', now());
      return { type, ok: true };
    }
    if (type === 'escalate') {
      const level = Math.min(3, Math.max(1, Number(params.level || ticket.level + 1)));
      this.db.prepare('UPDATE tickets SET level=?, updated_at=? WHERE id=? AND tenant_id=?').run(level, now(), ticket.id, tenant_id);
      return { type, ok: true, level };
    }
    if (type === 'assign') {
      this.db.prepare('UPDATE tickets SET assignee_id=?, updated_at=? WHERE id=? AND tenant_id=?').run(params.agent_id || '', now(), ticket.id, tenant_id);
      return { type, ok: true, agent_id: params.agent_id };
    }
    if (type === 'tag') {
      const tags = Array.isArray(ticket.tags) ? ticket.tags : safeJson(ticket.tags, []);
      const newTags = Array.from(new Set([...tags, ...(params.tags || [])]));
      this.db.prepare('UPDATE tickets SET tags=?, updated_at=? WHERE id=? AND tenant_id=?').run(JSON.stringify(newTags), now(), ticket.id, tenant_id);
      return { type, ok: true, tags: newTags };
    }
    return { type, ok: false, error: 'Unknown action type' };
  }

  runs(tenant_id, limit = 50) {
    return { success: true, runs: this.db.prepare('SELECT * FROM automaton_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, limit) };
  }

  outbox(tenant_id, limit = 50) {
    return { success: true, items: this.db.prepare('SELECT * FROM outbox WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?').all(tenant_id, limit) };
  }
}

export default new AutomatonService();
export { AutomatonService };
