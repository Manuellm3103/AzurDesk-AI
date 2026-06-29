import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

// ABAC Policies: attribute-based access control per tenant, resource and action.
class ABACService {
  addPolicy({ tenant_id, name, resource, action, conditions, effect = 'allow', priority = 0 }) {
    const id = randomUUID();
    db.prepare(`INSERT INTO abac_policies (id, tenant_id, name, resource, action, conditions, effect, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenant_id, name, resource, action, JSON.stringify(conditions || {}), effect, priority, now());
    return { id, tenant_id, name, resource, action, conditions, effect, priority };
  }

  listPolicies(tenant_id) {
    return db.prepare(`SELECT * FROM abac_policies WHERE tenant_id = ? ORDER BY priority DESC, created_at DESC`).all(tenant_id).map(r => ({
      ...r, conditions: JSON.parse(r.conditions || '{}')
    }));
  }

  evaluate({ tenant_id, subject = {}, resource, action, environment = {} }) {
    const policies = this.listPolicies(tenant_id).filter(p => p.resource === resource && p.action === action);
    let decision = 'allow'; // default allow if no policy
    for (const p of policies) {
      const match = this.matchConditions(p.conditions, { subject, resource, action, environment });
      if (match) {
        decision = p.effect;
      }
    }
    return { allowed: decision === 'allow', decision, tenant_id, resource, action };
  }

  matchConditions(conditions, ctx) {
    for (const [key, expected] of Object.entries(conditions)) {
      // key like 'subject.role' or 'environment.time_of_day'
      const parts = key.split('.');
      let val = ctx;
      for (const part of parts) {
        val = val?.[part];
      }
      if (Array.isArray(expected)) {
        if (!expected.includes(val)) return false;
      } else if (expected !== undefined && val !== expected) {
        return false;
      }
    }
    return true;
  }
}

export default new ABACService();
