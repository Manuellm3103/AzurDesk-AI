import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// BullMQ-backed event queue. Falls back to SQLite eventQueueService when REDIS_URL unavailable.
class BullmqQueueService {
  constructor() {
    this.connection = null;
    this.queues = new Map();
    this.workers = new Map();
    if (process.env.REDIS_URL) {
      try {
        this.connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
      } catch (e) {
        console.warn('[BullMQ] Redis connection failed, falling back to SQLite:', e.message);
        this.connection = null;
      }
    }
  }

  available() {
    return !!this.connection;
  }

  _queue(name) {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection: this.connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } } }));
    }
    return this.queues.get(name);
  }

  async enqueue(queue, payload, { max_attempts = 3, delayMs = 0 } = {}) {
    const q = this._queue(queue);
    const job = await q.add('job', payload, { attempts: max_attempts, delay: delayMs, backoff: { type: 'exponential', delay: 1000 } });
    return { id: job.id, queue, status: 'pending' };
  }

  async pop(queue) {
    // BullMQ is push/pull via workers; pop simulation uses getJobs
    const q = this._queue(queue);
    const jobs = await q.getWaiting(0, 0);
    if (!jobs.length) return null;
    const job = jobs[0];
    return { id: job.id, queue, payload: job.data, status: 'active' };
  }

  async complete(id, result, status = 'completed') {
    const job = await this._findJob(id);
    if (job) {
      if (status === 'completed') await job.moveToCompleted(result, true);
      else await job.moveToFailed(new Error('manual fail'), true);
    }
    return { id, status };
  }

  async fail(id, error) {
    const job = await this._findJob(id);
    if (job) {
      await job.moveToFailed(new Error(String(error)), true);
    }
    return { id, status: 'failed' };
  }

  async list(queue, limit = 100) {
    const q = this._queue(queue);
    const states = ['completed', 'failed', 'waiting', 'active', 'delayed'];
    const out = [];
    for (const state of states) {
      const jobs = await q.getJobs([state], 0, limit - 1, true);
      for (const j of jobs) {
        out.push({ id: j.id, queue, payload: j.data, status: state, result: j.returnvalue || j.failedReason });
      }
    }
    return out.slice(0, limit);
  }

  async _findJob(id) {
    for (const q of this.queues.values()) {
      const job = await q.getJob(id);
      if (job) return job;
    }
    return null;
  }

  registerWorker(queue, handler) {
    if (!this.connection) return null;
    if (this.workers.has(queue)) return this.workers.get(queue);
    const worker = new Worker(queue, async (job) => {
      return handler(job.data);
    }, { connection: this.connection });
    this.workers.set(queue, worker);
    return worker;
  }

  async close() {
    for (const w of this.workers.values()) await w.close();
    for (const q of this.queues.values()) await q.close();
    if (this.connection) await this.connection.quit();
  }
}

export default new BullmqQueueService();
