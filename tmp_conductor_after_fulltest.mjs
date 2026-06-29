
import db from './src/services/db.js';
import conductorLite from './src/services/conductorLiteService.js';
const tenant = 'tenant_' + Math.random();
db.exec('DELETE FROM causal_alerts');
db.exec('DELETE FROM causal_alert_correlations');
db.exec('DELETE FROM conductor_workflows');
db.exec('DELETE FROM conductor_runs');
db.exec('DELETE FROM durable_executions');
db.exec('DELETE FROM durable_execution_events');
try {
  const wf = conductorLite.defineWorkflow(tenant, { name: 'simple', dag: { steps: [] } });
  console.log('ok', wf.id);
} catch (e) {
  console.error('ERROR', e.message, e.stack);
}
