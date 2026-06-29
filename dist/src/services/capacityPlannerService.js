import db from './db.js';
import { now } from './_utils.js';

class CapacityPlannerService {
  forecast({ tenant_id, hours = 4 } = {}) {
    const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const incoming = db.prepare('SELECT COUNT(*) c FROM tickets WHERE tenant_id = ? AND created_at > ?').get(tenant_id, windowStart).c;
    const open = db.prepare("SELECT COUNT(*) c FROM tickets WHERE tenant_id = ? AND status NOT IN ('done','cerrado','resuelto')").get(tenant_id).c;
    const activeAgents = db.prepare("SELECT COUNT(*) c FROM agents WHERE tenant_id = ?").get(tenant_id).c || 1;
    const meshAgents = db.prepare("SELECT COUNT(*) c FROM agent_mesh_nodes WHERE tenant_id = ? AND active = 1").get(tenant_id).c || 0;

    const ratePerHour = incoming / hours;
    const avgHandleTime = 1.5; // horas por ticket (configurable)
    const workload = open + ratePerHour * avgHandleTime;
    const capacity = activeAgents + meshAgents * 0.5; // mesh es 0.5 FTE por disponibilidad variable
    const gap = Math.max(0, Math.ceil(workload - capacity));
    const utilization = capacity ? Math.min(1, workload / capacity) : 0;
    const risk = utilization > 0.9 ? 'critical' : utilization > 0.75 ? 'high' : utilization > 0.5 ? 'medium' : 'low';

    return {
      success: true,
      forecast: {
        tenant_id,
        hours,
        incoming_tickets: incoming,
        rate_per_hour: Number(ratePerHour.toFixed(2)),
        open_tickets: open,
        active_agents: activeAgents,
        mesh_agents: meshAgents,
        projected_workload: Number(workload.toFixed(2)),
        available_capacity: Number(capacity.toFixed(2)),
        utilization: Number(utilization.toFixed(2)),
        agents_needed: gap,
        risk
      }
    };
  }
}

export default new CapacityPlannerService();
export { CapacityPlannerService };
