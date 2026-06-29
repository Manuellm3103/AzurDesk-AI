import db from './db.js';
import { now, safeJson } from './_utils.js';
import { randomUUID } from 'crypto';

// Local LLM Router fallback using SQLite-backed model registry and simple routing heuristics.
// Designed to integrate later with llama.cpp / ONNX Runtime binaries without cloud dependency.
class LocalLLMRouterService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_llm_models (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT,
        backend TEXT, -- llama.cpp, onnx, node-llama-cpp
        path TEXT,
        context_size INTEGER,
        multimodal INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 0,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_local_llm ON local_llm_models (tenant_id, enabled, priority);
    `);
  }

  register(tenant_id, { name, backend = 'llama.cpp', path, context_size = 4096, multimodal = false, priority = 0 }) {
    this.ensureTables();
    const id = randomUUID();
    db.prepare('INSERT INTO local_llm_models (id, tenant_id, name, backend, path, context_size, multimodal, enabled, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, name, backend, path, context_size, multimodal ? 1 : 0, 1, priority, now());
    return { id, tenant_id, name, backend, path, enabled: true };
  }

  list(tenant_id) {
    this.ensureTables();
    return db.prepare('SELECT * FROM local_llm_models WHERE tenant_id=? ORDER BY priority DESC, created_at ASC').all(tenant_id)
      .map(r => ({ ...r, multimodal: !!r.multimodal, enabled: !!r.enabled }));
  }

  // Route to a local model based on payload complexity and multimodal needs
  route(tenant_id, { text = '', images = [] }) {
    const models = this.list(tenant_id).filter(m => m.enabled);
    if (!models.length) return { local: null, reason: 'no local models registered' };
    const needsMultimodal = Array.isArray(images) && images.length > 0;
    const complexity = text.length > 2000 ? 'complex' : text.length > 400 ? 'medium' : 'simple';
    let candidates = models;
    if (needsMultimodal) candidates = candidates.filter(m => m.multimodal);
    // Prefer higher context for complex, higher priority otherwise
    candidates.sort((a, b) => {
      const scoreA = (a.priority * 10) + (complexity === 'complex' ? a.context_size : 0);
      const scoreB = (b.priority * 10) + (complexity === 'complex' ? b.context_size : 0);
      return scoreB - scoreA;
    });
    return { local: candidates[0], complexity, needsMultimodal, reason: 'routed by complexity and capabilities' };
  }

  // Placeholder generation: in production this spawns llama.cpp / ONNX process
  async generate(tenant_id, { text, images = [] }) {
    const route = this.route(tenant_id, { text, images });
    if (!route.local) return { success: false, error: route.reason };
    return {
      success: true,
      model: route.local,
      note: 'Local inference placeholder: integrate llama.cpp or ONNX Runtime binary to execute.',
      route
    };
  }
}

export default new LocalLLMRouterService();
