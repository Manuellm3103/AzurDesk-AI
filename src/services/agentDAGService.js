import agentRuntime from './agentRuntimeService.js';
import aaasGateway from './aaasGatewayService.js';
import { now } from './_utils.js';

// Agent DAG Orchestrator: decompose an intent into a directed acyclic graph of agent calls
// and execute topologically, storing run state.
class AgentDAGService {
  async run({ tenant_id, intent, payload, plan }) {
    if (!Array.isArray(plan) || plan.length === 0) {
      return { success: false, error: 'plan must be a non-empty array of nodes' };
    }
    const dag_id = `dag-${Date.now()}`;
    const state = {};
    const runs = [];
    const byId = Object.fromEntries(plan.map(n => [n.id, { ...n, done: false, output: null, error: null }]));
    // Kahn topological sort
    const inDegree = {};
    for (const n of plan) inDegree[n.id] = 0;
    for (const n of plan) {
      for (const d of (n.deps || [])) {
        if (byId[d]) inDegree[n.id]++;
      }
    }
    const queue = plan.filter(n => inDegree[n.id] === 0).map(n => n.id);
    while (queue.length) {
      const id = queue.shift();
      const node = byId[id];
      if (node.done) continue;
      try {
        // resolve inputs from deps
        const inputs = {};
        for (const depId of (node.deps || [])) {
          if (byId[depId]?.output) Object.assign(inputs, byId[depId].output);
        }
        const fullPayload = { ...payload, ...node.payload, ...inputs, tenant_id, _dag_id: dag_id };
        const r = await aaasGateway.invoke(tenant_id, { intent: node.intent, payload: fullPayload });
        node.output = r.success ? (r.output || {}) : { error: r.error };
        node.error = r.success ? null : r.error;
        runs.push({ node_id: id, intent: node.intent, success: r.success, output: node.output, at: now() });
      } catch (e) {
        node.error = e.message;
        node.output = { error: e.message };
        runs.push({ node_id: id, intent: node.intent, success: false, error: e.message, at: now() });
      }
      node.done = true;
      for (const next of plan) {
        if ((next.deps || []).includes(id)) {
          inDegree[next.id]--;
          if (inDegree[next.id] === 0) queue.push(next.id);
        }
      }
    }
    const failed = Object.values(byId).some(n => n.error);
    return { success: !failed, dag_id, intent, runs, outputs: Object.fromEntries(Object.values(byId).map(n => [n.id, n.output])) };
  }
}

export default new AgentDAGService();
