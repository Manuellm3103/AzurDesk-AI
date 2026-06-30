import db from './db.js';
import { now } from './_utils.js';
import { createHash } from 'crypto';

/**
 * Prompt Cache Service — 2026-grade LLM cost optimizer.
 * - Deterministic content-hash based cache (SHA-256 over normalized prompt + tools schema).
 * - Per-tenant + per-model TTL with automatic eviction.
 * - Tracks cache hits/misses for cost-savings reporting.
 * - Compatible with Anthropic prompt caching and OpenAI automatic caching semantics.
 */
class PromptCacheService {
  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_cache (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        prompt_hash TEXT NOT NULL,
        prompt_tokens INTEGER,
        response TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost REAL,
        hit_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_hit_at TEXT,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_cache_lookup
        ON prompt_cache (tenant_id, model_provider, model_name, prompt_hash, expires_at);
      CREATE INDEX IF NOT EXISTS idx_prompt_cache_expires
        ON prompt_cache (expires_at);

      CREATE TABLE IF NOT EXISTS prompt_cache_stats (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        day TEXT NOT NULL,
        hits INTEGER DEFAULT 0,
        misses INTEGER DEFAULT 0,
        tokens_saved INTEGER DEFAULT 0,
        cost_saved REAL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_cache_stats_unique
        ON prompt_cache_stats (tenant_id, day);
    `);
  }

  // Normalize prompt so trivial differences (extra whitespace) still hit the cache.
  normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  hash(prompt, toolsSchema) {
    const norm = this.normalize(prompt);
    const tools = toolsSchema ? JSON.stringify(toolsSchema) : '';
    return createHash('sha256').update(norm + '|' + tools).digest('hex');
  }

  // Default TTLs in seconds by model provider — 2026 heuristic.
  defaultTtlSeconds(modelProvider) {
    switch (String(modelProvider || '').toLowerCase()) {
      case 'anthropic': return 300; // Anthropic prompt cache: 5 min
      case 'openai': return 600;     // OpenAI auto-cache: longer
      case 'google': return 300;
      case 'ollama': return 900;
      default: return 300;
    }
  }

  get(tenantId, { modelProvider, modelName, prompt, toolsSchema }) {
    this.ensureTables();
    const promptHash = this.hash(prompt, toolsSchema);
    const nowIso = now();
    const row = db.prepare(`
      SELECT * FROM prompt_cache
      WHERE tenant_id = ? AND model_provider = ? AND model_name = ?
        AND prompt_hash = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).get(tenantId, modelProvider, modelName, promptHash, nowIso);
    if (row) {
      db.prepare('UPDATE prompt_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE id = ?')
        .run(nowIso, row.id);
      this._recordHit(tenantId, row);
      return {
        hit: true,
        response: JSON.parse(row.response),
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        cost: row.cost,
        cache_id: row.id
      };
    }
    this._recordMiss(tenantId);
    return { hit: false, promptHash };
  }

  set(tenantId, { modelProvider, modelName, prompt, toolsSchema, response, inputTokens, outputTokens, cost, ttlSeconds }) {
    this.ensureTables();
    const promptHash = this.hash(prompt, toolsSchema);
    const ttl = ttlSeconds || this.defaultTtlSeconds(modelProvider);
    const createdAt = now();
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const id = `${tenantId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    db.prepare(`
      INSERT INTO prompt_cache
      (id, tenant_id, model_provider, model_name, prompt_hash, prompt_tokens, response,
       input_tokens, output_tokens, cost, hit_count, created_at, last_hit_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)
    `).run(
      id, tenantId, modelProvider, modelName, promptHash,
      this.estimateTokens(prompt),
      JSON.stringify(response),
      inputTokens || 0, outputTokens || 0, cost || 0,
      createdAt, expiresAt
    );
    return { id, expires_at: expiresAt, ttl_seconds: ttl };
  }

  estimateTokens(text) {
    // Rough heuristic: 1 token ~ 4 chars (English/Spanish average).
    return Math.max(1, Math.ceil((text || '').length / 4));
  }

  invalidate(tenantId, { modelProvider, modelName } = {}) {
    this.ensureTables();
    if (modelProvider && modelName) {
      return db.prepare(`
        DELETE FROM prompt_cache
        WHERE tenant_id = ? AND model_provider = ? AND model_name = ?
      `).run(tenantId, modelProvider, modelName).changes;
    }
    return db.prepare('DELETE FROM prompt_cache WHERE tenant_id = ?').run(tenantId).changes;
  }

  cleanup() {
    this.ensureTables();
    return db.prepare('DELETE FROM prompt_cache WHERE expires_at <= ?').run(now()).changes;
  }

  stats(tenantId, { days = 7 } = {}) {
    this.ensureTables();
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
    return db.prepare(`
      SELECT day, hits, misses, tokens_saved, cost_saved
      FROM prompt_cache_stats
      WHERE tenant_id = ? AND day >= ?
      ORDER BY day ASC
    `).all(tenantId, since);
  }

  _recordHit(tenantId, row) {
    const day = new Date().toISOString().slice(0, 10);
    const ts = now();
    // tokens_saved = input tokens (we did not pay them again)
    const tokensSaved = (row.input_tokens || 0);
    const costSaved = (row.cost || 0);
    db.prepare(`
      INSERT INTO prompt_cache_stats (id, tenant_id, day, hits, misses, tokens_saved, cost_saved, updated_at)
      VALUES (?, ?, ?, 1, 0, ?, ?, ?)
      ON CONFLICT(tenant_id, day) DO UPDATE SET
        hits = hits + 1,
        tokens_saved = tokens_saved + ?,
        cost_saved = cost_saved + ?,
        updated_at = ?
    `).run(`stats_${tenantId}_${day}`, tenantId, day, tokensSaved, costSaved, ts,
           tokensSaved, costSaved, ts);
  }

  _recordMiss(tenantId) {
    const day = new Date().toISOString().slice(0, 10);
    const ts = now();
    db.prepare(`
      INSERT INTO prompt_cache_stats (id, tenant_id, day, hits, misses, tokens_saved, cost_saved, updated_at)
      VALUES (?, ?, ?, 0, 1, 0, 0, ?)
      ON CONFLICT(tenant_id, day) DO UPDATE SET
        misses = misses + 1,
        updated_at = ?
    `).run(`stats_${tenantId}_${day}`, tenantId, day, ts, ts);
  }
}

export default new PromptCacheService();
