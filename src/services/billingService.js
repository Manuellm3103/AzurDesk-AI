import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

// Usage-Based Billing: record usage per tenant and generate simple invoices.
class BillingService {
  recordUsage({ tenant_id, resource, metric, quantity = 1, period }) {
    const id = randomUUID();
    const p = period || this.currentPeriod();
    db.prepare(`INSERT INTO billing_usage (id, tenant_id, resource, metric, quantity, period, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, tenant_id, resource, metric, quantity, p, now());
    return { id, tenant_id, resource, metric, quantity, period: p };
  }

  getUsage(tenant_id, period) {
    const p = period || this.currentPeriod();
    const rows = db.prepare('SELECT resource, metric, SUM(quantity) as total FROM billing_usage WHERE tenant_id = ? AND period = ? GROUP BY resource, metric').all(tenant_id, p);
    return { tenant_id, period: p, items: rows };
  }

  getInvoice(tenant_id, period) {
    const usage = this.getUsage(tenant_id, period);
    const rates = { 'agent.invoke': 0.01, 'llm.token': 0.0001, 'storage.mb': 0.001 };
    let total = 0;
    const lines = usage.items.map(u => {
      const rate = rates[u.resource] || 0;
      const cost = u.total * rate;
      total += cost;
      return { ...u, rate, cost: Math.round(cost * 1000) / 1000 };
    });
    return { tenant_id, period: usage.period, lines, total: Math.round(total * 1000) / 1000, currency: 'USD' };
  }

  getSummary(tenant_id) {
    const invoice = this.getInvoice(tenant_id);
    const periods = db.prepare('SELECT DISTINCT period FROM billing_usage WHERE tenant_id = ? ORDER BY period DESC LIMIT 6').all(tenant_id);
    const totalsByPeriod = periods.map(p => {
      const inv = this.getInvoice(tenant_id, p.period);
      return { period: p.period, total: inv.total, items: inv.lines.length };
    });
    return {
      tenant_id,
      current_period: invoice.period,
      current_total: invoice.total,
      currency: invoice.currency,
      history: totalsByPeriod
    };
  }

  currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}

export default new BillingService();
