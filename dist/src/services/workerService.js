import db from './db.js';
import eventQueue from './eventQueueService.js';
import bullmqQueue from './bullmqQueueService.js';
import { now } from './_utils.js';

// Workers for durable workflows, swarm messages, and handoffs using the SQLite event queue
class WorkerService {
  constructor() {
    this.handlers = new Map();
    this.intervalMs = 2000;
    this.timer = null;
  }

  register(queue, handler) {
    this.handlers.set(queue, handler);
    bullmqQueue.registerWorker(queue, handler);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.processAll(), this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    bullmqQueue.close().catch(() => {});
  }

  processAll() {
    for (const [queue, handler] of this.handlers) {
      const job = eventQueue.pop(queue);
      if (!job) continue;
      try {
        const result = handler(job.payload);
        eventQueue.complete(job.id, result);
      } catch (e) {
        eventQueue.fail(job.id, e.message);
      }
    }
  }

  // Convenience: enqueue durable workflow step jobs
  enqueueWorkflowStep(workflowId, stepName, tenant_id, payload) {
    return eventQueue.enqueue('durable-workflows', { workflowId, stepName, tenant_id, payload, kind: 'step' }, { max_attempts: 3 });
  }

  enqueueSwarmMessage(tenant_id, message) {
    return eventQueue.enqueue('swarm-messages', { tenant_id, message, kind: 'swarm-message' }, { max_attempts: 2 });
  }

  enqueueHandoff(tenant_id, handoffId) {
    return eventQueue.enqueue('handoffs', { tenant_id, handoffId, kind: 'handoff' }, { max_attempts: 2 });
  }
}

export default new WorkerService();
