import alerts from '../src/services/causalAlertingService.js';
import { randomUUID } from 'crypto';

// TDD para Causal Alerting.

const tenant = `causal-test-${randomUUID()}`;
let failed = 0;
const assert = (ok, label) => {
  if (ok) console.log('✅', label);
  else { console.log('❌', label); failed++; }
};

// Seed 5 baseline points near 10 for agent-1 and agent-2
for (let i = 0; i < 5; i++) {
  alerts.ingestMetric(tenant, { metric: 'cpu', source: 'agent-1', value: 10 + (Math.random() * 0.2 - 0.1) });
  alerts.ingestMetric(tenant, { metric: 'cpu', source: 'agent-2', value: 10 + (Math.random() * 0.2 - 0.1) });
}

// Anomaly on agent-1
const a1 = alerts.ingestMetric(tenant, { metric: 'cpu', source: 'agent-1', value: 30 });
assert(a1.id && a1.z_score > 2, 'ingest anomaly creates alert');
assert(a1.severity === 'warning' || a1.severity === 'critical', 'severity escalated');

// Peer anomaly on same metric creates correlation
const a3 = alerts.ingestMetric(tenant, { metric: 'cpu', source: 'agent-2', value: 35 });
const corr = alerts.getCorrelations(a1.id);
assert(corr.length >= 1 && corr.some(c => c.related_source === 'agent-2'), 'correlation across sources');

// Normal point should be noisy
const a2 = alerts.ingestMetric(tenant, { metric: 'cpu', source: 'agent-1', value: 10.2 });
assert(a2.status === 'noisy', 'normal point marked noisy');

// List open alerts
const list = alerts.listAlerts(tenant, { status: 'open' });
assert(list.some(a => a.id === a1.id), 'list open alerts');

// Update status
const updated = alerts.updateAlertStatus(a1.id, tenant, 'resolved');
assert(updated && updated.status === 'resolved', 'update alert status');

if (failed) { console.log(`\nFAILED: ${failed}`); process.exit(1); }
console.log('\nCAUSAL ALERTING: all tests passed');
