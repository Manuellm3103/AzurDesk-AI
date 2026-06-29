import db from './db.js';
import { now } from './_utils.js';
import { randomUUID, createHash } from 'crypto';

/**
 * Agent Tracing Service - OpenTelemetry-like tracing for AI agents
 * Tracks spans, traces, and costs associated with LLM calls, tool usage, and agent workflows.
 */
class AgentTracingService {
  constructor() {
    this.ensureTables();
  }

  ensureTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_traces (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        parent_span_id TEXT,
        tenant_id TEXT NOT NULL,
        agent_id TEXT,
        agent_type TEXT,
        operation TEXT NOT NULL,
        model_provider TEXT,
        model_name TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost REAL,
        latency_ms INTEGER,
        status TEXT DEFAULT 'started',
        attributes TEXT, -- JSON string
        start_time TEXT NOT NULL,
        end_time TEXT,
        created_at TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_agent_traces_trace ON agent_traces (trace_id);
      CREATE INDEX IF NOT EXISTS idx_agent_traces_span ON agent_traces (span_id);
      CREATE INDEX IF NOT EXISTS idx_agent_traces_tenant ON agent_traces (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_agent_traces_agent ON agent_traces (agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_traces_time ON agent_traces (start_time);
      
      CREATE TABLE IF NOT EXISTS model_costs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        input_cost_per_1k REAL NOT NULL,
        output_cost_per_1k REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        updated_at TEXT NOT NULL,
        UNIQUE(provider, model_name)
      );
      
      CREATE TABLE IF NOT EXISTS trace_aggregates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        date TEXT NOT NULL, -- YYYY-MM-DD
        total_spans INTEGER,
        total_cost REAL,
        avg_latency_ms REAL,
        error_count INTEGER,
        success_count INTEGER,
        UNIQUE(tenant_id, date)
      );
    `);
    
    // Insert default model costs if not present
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO model_costs (id, provider, model_name, input_cost_per_1k, output_cost_per_1k, currency, updated_at)
      VALUES 
        (?, 'openai', 'gpt-4', 0.03, 0.06, 'USD', ?),
        (?, 'openai', 'gpt-3.5-turbo', 0.0015, 0.002, 'USD', ?),
        (?, 'anthropic', 'claude-3-opus', 0.015, 0.075, 'USD', ?),
        (?, 'anthropic', 'claude-3-sonnet', 0.003, 0.015, 'USD', ?),
        (?, 'anthropic', 'claude-3-haiku', 0.00025, 0.00125, 'USD', ?),
        (?, 'google', 'gemini-pro', 0.0005, 0.0015, 'USD', ?),
        (?, 'ollama', 'llama3', 0.0, 0.0, 'USD', ?),
        (?, 'local', 'llama-cpp', 0.0, 0.0, 'USD', ?)
    `);
    const nowStr = now();
    stmt.run(
      randomUUID(), nowStr,
      randomUUID(), nowStr,
      randomUUID(), nowStr,
      randomUUID(), nowStr,
      randomUUID(), nowStr,
      randomUUID(), nowStr,
      randomUUID(), nowStr,
      randomUUID(), nowStr
    );
  }

  /**
   * Start a new span
   * @param {Object} params - Span parameters
   * @returns {Object} Span object with id and start time
   */
  startSpan(params) {
    const {
      trace_id,
      parent_span_id = null,
      tenant_id,
      agent_id = null,
      agent_type = null,
      operation,
      model_provider = null,
      model_name = null,
      input_tokens = 0,
      output_tokens = 0,
      attributes = {}
    } = params;
    
    if (!trace_id || !tenant_id || !operation) {
      throw new Error('trace_id, tenant_id, and operation are required');
    }
    
    const span_id = randomUUID();
    const start_time = now();
    
    // Calculate cost based on model pricing
    let cost = 0;
    if (model_provider && model_name) {
      const model = this.getModelCost(model_provider, model_name);
      if (model) {
        cost = ((input_tokens / 1000) * model.input_cost_per_1k) + 
               ((output_tokens / 1000) * model.output_cost_per_1k);
      }
    }
    
    db.prepare(`
      INSERT INTO agent_traces 
      (id, trace_id, span_id, parent_span_id, tenant_id, agent_id, agent_type, operation, 
       model_provider, model_name, input_tokens, output_tokens, cost, status, attributes, start_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      span_id, trace_id, span_id, parent_span_id, tenant_id, agent_id, agent_type, operation,
      model_provider, model_name, input_tokens, output_tokens, cost, 'started', 
      JSON.stringify(attributes), start_time, start_time
    );
    
    return { span_id, start_time: Date.now() };
  }

  /**
   * End a span with optional output and update cost if needed
   * @param {string} span_id - Span ID to end
   * @param {Object} params - Optional parameters (output, status, etc.)
   * @returns {Object} Updated span data
   */
  endSpan(span_id, params = {}) {
    const { output = null, status = 'completed', attributes = {} } = params;
    const end_time = now();
    
    // Get the span to calculate duration
    const span = db.prepare('SELECT * FROM agent_traces WHERE span_id = ?').get(span_id);
    if (!span) {
      throw new Error(`Span not found: ${span_id}`);
    }
    
    const start_time = new Date(span.start_time).getTime();
    const end_time_ms = new Date(end_time).getTime();
    const latency_ms = end_time_ms - start_time;
    
    // Update attributes if provided
    let final_attributes = span.attributes ? JSON.parse(span.attributes) : {};
    if (attributes && Object.keys(attributes).length > 0) {
      final_attributes = { ...final_attributes, ...attributes };
    }
    
    db.prepare(`
      UPDATE agent_traces 
      SET end_time = ?, status = ?, attributes = ?, latency_ms = ?
      WHERE span_id = ?
    `).run(
      end_time, status, JSON.stringify(final_attributes), latency_ms, span_id
    );
    
    // Update daily aggregates
    this.updateDailyAggregate(span.tenant_id, span.start_time, latency_ms, span.cost, status === 'error' ? 1 : 0, status === 'completed' ? 1 : 0);
    
    return {
      span_id,
      trace_id: span.trace_id,
      parent_span_id: span.parent_span_id,
      tenant_id: span.tenant_id,
      agent_id: span.agent_id,
      agent_type: span.agent_type,
      operation: span.operation,
      model_provider: span.model_provider,
      model_name: span.model_name,
      input_tokens: span.input_tokens,
      output_tokens: span.output_tokens,
      cost: span.cost,
      latency_ms,
      status,
      attributes: final_attributes,
      start_time: span.start_time,
      end_time
    };
  }

  /**
   * Get model cost information
   * @param {string} provider - Model provider (openai, anthropic, etc.)
   * @param {string} model_name - Model name
   * @returns {Object|null} Cost data or null if not found
   */
  getModelCost(provider, model_name) {
    return db.prepare(`
      SELECT * FROM model_costs 
      WHERE provider = ? AND model_name = ?
    `).get(provider, model_name);
  }

  /**
   * Update or insert model cost
   * @param {Object} costData - Cost data to upsert
   */
  upsertModelCost(costData) {
    const { id, provider, model_name, input_cost_per_1k, output_cost_per_1k, currency = 'USD' } = costData;
    const nowStr = now();
    
    if (id) {
      // Update existing
      db.prepare(`
        UPDATE model_costs 
        SET input_cost_per_1k = ?, output_cost_per_1k = ?, currency = ?, updated_at = ?
        WHERE id = ?
      `).run(input_cost_per_1k, output_cost_per_1k, currency, nowStr, id);
    } else {
      // Insert new
      db.prepare(`
        INSERT INTO model_costs (id, provider, model_name, input_cost_per_1k, output_cost_per_1k, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), provider, model_name, input_cost_per_1k, output_cost_per_1k, currency, nowStr);
    }
  }

  /**
   * Update daily aggregate metrics
   * @param {string} tenant_id - Tenant ID
   * @param {string} start_time - Start time of the span (ISO string)
   * @param {number} latency_ms - Latency in milliseconds
   * @param {number} cost - Cost of the span
   * @param {number} error_count - 1 if error, else 0
   * @param {number} success_count - 1 if success, else 0
   */
  updateDailyAggregate(tenant_id, start_time, latency_ms, cost, error_count, success_count) {
    const date = new Date(start_time).toISOString().split('T')[0]; // YYYY-MM-DD
    
    const row = db.prepare('SELECT * FROM trace_aggregates WHERE tenant_id = ? AND date = ?').get(tenant_id, date);
    
    if (row) {
      // Update existing
      const newTotalSpans = row.total_spans + 1;
      const newTotalCost = (row.total_cost || 0) + cost;
      const newTotalLatency = (row.avg_latency_ms * row.total_spans) + latency_ms;
      const newAvgLatency = newTotalLatency / newTotalSpans;
      const newErrorCount = (row.error_count || 0) + error_count;
      const newSuccessCount = (row.success_count || 0) + success_count;
      
      db.prepare(`
        UPDATE trace_aggregates 
        SET total_spans = ?, total_cost = ?, avg_latency_ms = ?, error_count = ?, success_count = ?
        WHERE tenant_id = ? AND date = ?
      `).run(newTotalSpans, newTotalCost, newAvgLatency, newErrorCount, newSuccessCount, tenant_id, date);
    } else {
      // Insert new
      db.prepare(`
        INSERT INTO trace_aggregates (id, tenant_id, date, total_spans, total_cost, avg_latency_ms, error_count, success_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), tenant_id, date, 1, cost, latency_ms, error_count, success_count);
    }
  }

  /**
   * Get a span by its ID
   * @param {string} span_id - Span ID
   * @returns {Object|null} Span data or null if not found
   */
  getSpanById(span_id) {
    const row = db.prepare('SELECT * FROM agent_traces WHERE span_id = ?').get(span_id);
    if (!row) return null;
    return {
      ...row,
      attributes: row.attributes ? JSON.parse(row.attributes) : {}
    };
  }

  /**
   * Get traces for a trace ID
   * @param {string} trace_id - Trace ID
   * @returns {Array} Array of spans in the trace
   */
  getTraceById(trace_id) {
    const rows = db.prepare('SELECT * FROM agent_traces WHERE trace_id = ? ORDER BY start_time').all(trace_id);
    return rows.map(row => ({
      ...row,
      attributes: row.attributes ? JSON.parse(row.attributes) : {}
    }));
  }

  /**
   * Get traces for a tenant with optional filtering
   * @param {Object} filters - Filters (tenant_id, start_date, end_date, operation, etc.)
   * @returns {Array} Array of traces
   */
  getTracesByTenant(filters = {}) {
    let sql = 'SELECT * FROM agent_traces WHERE tenant_id = ?';
    const params = [filters.tenant_id];
    
    if (filters.start_date) {
      sql += ' AND start_time >= ?';
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ' AND start_time <= ?';
      params.push(filters.end_date);
    }
    if (filters.operation) {
      sql += ' AND operation = ?';
      params.push(filters.operation);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    
    sql += ' ORDER BY start_time DESC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const rows = db.prepare(sql).all(...params);
    return rows.map(row => ({
      ...row,
      attributes: row.attributes ? JSON.parse(row.attributes) : {}
    }));
  }

  /**
   * Get trace aggregates for a tenant and date range
   * @param {Object} filters - Filters (tenant_id, start_date, end_date)
   * @returns {Array} Array of aggregate rows
   */
  getTraceAggregates(filters = {}) {
    let sql = 'SELECT * FROM trace_aggregates WHERE tenant_id = ?';
    const params = [filters.tenant_id];
    
    if (filters.start_date) {
      sql += ' AND date >= ?';
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ' AND date <= ?';
      params.push(filters.end_date);
    }
    
    sql += ' ORDER BY date DESC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    return db.prepare(sql).all(...params);
  }
}

export default new AgentTracingService();