import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

const DB_DIR = join(process.cwd(), 'data');
mkdirSync(DB_DIR, { recursive: true });
const db = new Database(join(DB_DIR, 'azurdesk_ai.db'));
db.pragma('journal_mode = WAL');

const migrations = [
  `CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, name TEXT, plan TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, email TEXT UNIQUE, password_hash TEXT,
    role TEXT, level INTEGER, skills TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, domain TEXT, published INTEGER DEFAULT 0,
    config TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY, site_id TEXT, slug TEXT, title TEXT, components TEXT, meta TEXT,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, tenant_id TEXT, requester_email TEXT, requester_name TEXT,
    subject TEXT, body TEXT, status TEXT, priority TEXT, level INTEGER, category TEXT,
    assignee_id TEXT, sla_minutes INTEGER, due_at TEXT, sentiment REAL, escalation_risk REAL,
    tags TEXT, channel TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_comments (
    id TEXT PRIMARY KEY, ticket_id TEXT, author_id TEXT, author_name TEXT, body TEXT,
    is_internal INTEGER, sentiment REAL, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_history (
    id TEXT PRIMARY KEY, ticket_id TEXT, action TEXT, from_value TEXT, to_value TEXT,
    actor_id TEXT, actor_name TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS kb_articles (
    id TEXT PRIMARY KEY, tenant_id TEXT, title TEXT, content TEXT, category TEXT,
    tags TEXT, embedding TEXT, views INTEGER DEFAULT 0, helpful INTEGER DEFAULT 0,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ml_models (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, type TEXT, version TEXT, params TEXT,
    metrics TEXT, path TEXT, active INTEGER DEFAULT 0, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, type TEXT, input TEXT, output TEXT,
    model TEXT, latency_ms INTEGER, confidence REAL, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_email TEXT, status TEXT, handoff_level INTEGER,
    last_heartbeat_at TEXT, stalled_count INTEGER DEFAULT 0, context TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_sessions_heartbeat ON chat_sessions (tenant_id, status, last_heartbeat_at)`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, intent TEXT,
    sentiment REAL, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, url TEXT, events TEXT, secret TEXT,
    active INTEGER DEFAULT 1, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, filename TEXT, stored_name TEXT, size INTEGER, ext TEXT,
    text TEXT, source TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, session_id TEXT, scope TEXT,
    content TEXT, importance REAL, confidence REAL DEFAULT 1.0, source TEXT, vector TEXT,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mem_user ON memories (tenant_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mem_session ON memories (tenant_id, session_id)`,
  `CREATE TABLE IF NOT EXISTS orchestrator_runs (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, goal TEXT, state TEXT DEFAULT 'DISCOVER',
    beads TEXT, evidence TEXT, quality_gate INTEGER, safety_gate INTEGER, token_gate INTEGER,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS kb_entities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT,
    kind TEXT,
    metadata TEXT,
    UNIQUE(tenant_id, name, kind)
  )`,
  `CREATE TABLE IF NOT EXISTS kb_relations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    source TEXT,
    target TEXT,
    relation TEXT,
    weight REAL DEFAULT 1.0,
    UNIQUE(tenant_id, source, target, relation)
  )`,
  `CREATE TABLE IF NOT EXISTS kb_entity_occurrences (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    entity_name TEXT,
    article_id TEXT,
    context TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tokenizer_models (
    id TEXT PRIMARY KEY,
    name TEXT,
    vocab TEXT,
    merges TEXT,
    vocab_size INTEGER,
    trained_on TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, role TEXT, level INTEGER, skills TEXT,
    status TEXT DEFAULT 'idle', current_task_id TEXT, last_heartbeat TEXT, metrics TEXT,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY, tenant_id TEXT, from_agent TEXT, to_agent TEXT, channel TEXT,
    body TEXT, read INTEGER DEFAULT 0, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_claims (
    id TEXT PRIMARY KEY, tenant_id TEXT, agent_id TEXT, task_id TEXT, task_type TEXT,
    status TEXT DEFAULT 'active', files TEXT, heartbeat_at TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS llm_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, request_type TEXT, complexity TEXT,
    model TEXT, latency_ms INTEGER, cost_estimate REAL, success INTEGER, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS memory_graph (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, from_node TEXT, relation TEXT,
    to_node TEXT, confidence REAL, source TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ollama_cloud_accounts (
    id TEXT PRIMARY KEY, tenant_id TEXT UNIQUE, api_key TEXT, endpoint TEXT,
    email TEXT, nickname TEXT, default_model TEXT, models TEXT,
    status TEXT DEFAULT 'disconnected', last_check_at TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ollama_cloud_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, account_id TEXT,
    name TEXT, model_id TEXT, size TEXT, description TEXT, capabilities TEXT,
    available INTEGER DEFAULT 1, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS team_rebalance_logs (
    id TEXT PRIMARY KEY, tenant_id TEXT, from_agent_id TEXT, to_agent_id TEXT,
    ticket_id TEXT, reason TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_health_snapshots (
    id TEXT PRIMARY KEY, tenant_id TEXT, agent_id TEXT, load_score REAL,
    burnout_risk TEXT, open_tickets INTEGER, breached_tickets INTEGER,
    avg_sentiment REAL, last_heartbeat TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS automaton_rules (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, description TEXT,
    condition TEXT, actions TEXT, enabled INTEGER DEFAULT 1, priority INTEGER DEFAULT 0,
    run_count INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS automaton_runs (
    id TEXT PRIMARY KEY, tenant_id TEXT, rule_id TEXT, ticket_id TEXT,
    matched INTEGER DEFAULT 0, actions TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, destination TEXT,
    payload TEXT, status TEXT DEFAULT 'pending', sent_at TEXT, error TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_mesh_nodes (
    id TEXT PRIMARY KEY, tenant_id TEXT, agent_id TEXT UNIQUE,
    name TEXT, role TEXT, level INTEGER, skills TEXT,
    availability REAL DEFAULT 1.0, reputation REAL DEFAULT 0.0,
    last_seen TEXT, endpoint TEXT, metadata TEXT,
    active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_mesh_assignments (
    id TEXT PRIMARY KEY, tenant_id TEXT, ticket_id TEXT, node_id TEXT,
    reason TEXT, score REAL, accepted INTEGER DEFAULT 0, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS legal_cases (
    id TEXT PRIMARY KEY, tenant_id TEXT, case_number TEXT, title TEXT, summary TEXT,
    type TEXT, subtype TEXT, status TEXT, priority TEXT, risk_score REAL,
    requester_email TEXT, requester_name TEXT, owner_id TEXT,
    requested_amount REAL, opposing_party TEXT, jurisdiction TEXT,
    filed_at TEXT, due_at TEXT, closed_at TEXT, outcome TEXT,
    approval_level INTEGER DEFAULT 1, approved_by TEXT, approved_at TEXT,
    tags TEXT, metadata TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS legal_tasks (
    id TEXT PRIMARY KEY, tenant_id TEXT, case_id TEXT, title TEXT, description TEXT,
    status TEXT, due_at TEXT, assigned_to TEXT, completed_at TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS legal_documents (
    id TEXT PRIMARY KEY, tenant_id TEXT, case_id TEXT, filename TEXT, stored_name TEXT,
    doc_type TEXT, size INTEGER, ext TEXT, text TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS legal_approvals (
    id TEXT PRIMARY KEY, tenant_id TEXT, case_id TEXT, level INTEGER,
    approver_id TEXT, decision TEXT, notes TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS legal_notes (
    id TEXT PRIMARY KEY, tenant_id TEXT, case_id TEXT, author_id TEXT, author_name TEXT,
    body TEXT, is_internal INTEGER, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS contract_reviews (
    id TEXT PRIMARY KEY, tenant_id TEXT, case_id TEXT, title TEXT, text TEXT,
    overall_score REAL, risk_level TEXT, findings TEXT, metadata TEXT,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, kind TEXT,
    base_url TEXT, api_key_ciphertext TEXT, api_key_nonce TEXT,
    models TEXT, priority INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1,
    rate_limit_rpm INTEGER, rate_limit_tpm INTEGER,
    last_check_at TEXT, status TEXT DEFAULT 'disconnected',
    metadata TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id TEXT PRIMARY KEY, tenant_id TEXT, provider_id TEXT, model TEXT,
    operation TEXT, input_tokens INTEGER, output_tokens INTEGER,
    cost_usd REAL, latency_ms INTEGER, success INTEGER, error TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS marketing_assets (
    id TEXT PRIMARY KEY, tenant_id TEXT, kind TEXT,
    title TEXT, prompt TEXT, content TEXT, metadata TEXT,
    status TEXT DEFAULT 'draft', created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, goal TEXT,
    target_audience TEXT, channels TEXT, schedule TEXT, status TEXT DEFAULT 'draft',
    assets TEXT, leads TEXT, metrics TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, key_hash TEXT, key_prefix TEXT,
    scopes TEXT, last_used_at TEXT, expires_at TEXT, enabled INTEGER DEFAULT 1,
    created_at TEXT, revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, tenant_id TEXT, actor_id TEXT, actor_type TEXT,
    action TEXT, resource_type TEXT, resource_id TEXT, details TEXT,
    ip_address TEXT, user_agent TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_quotas (
    id TEXT PRIMARY KEY, tenant_id TEXT, max_llm_calls_per_day INTEGER DEFAULT 1000,
    max_llm_cost_per_day REAL DEFAULT 10.0, max_api_keys INTEGER DEFAULT 10,
    max_agents INTEGER DEFAULT 50, max_storage_mb INTEGER DEFAULT 1024,
    current_llm_calls_today INTEGER DEFAULT 0, current_cost_today REAL DEFAULT 0,
    reset_at TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY, tenant_id TEXT, endpoint_id TEXT, event TEXT,
    payload TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0,
    response_code INTEGER, response_body TEXT, next_retry_at TEXT,
    created_at TEXT, delivered_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS prompt_templates (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, category TEXT,
    system_prompt TEXT, user_template TEXT, variables TEXT,
    model_hint TEXT, temperature REAL DEFAULT 0.7, max_tokens INTEGER DEFAULT 2048,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, type TEXT,
    title TEXT, body TEXT, data TEXT, read INTEGER DEFAULT 0,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_signups (
    id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, company_name TEXT,
    plan TEXT DEFAULT 'free', status TEXT DEFAULT 'active',
    verification_token TEXT, verified INTEGER DEFAULT 0,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ai_workflows (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, description TEXT,
    nodes TEXT, edges TEXT, status TEXT DEFAULT 'draft',
    version INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ai_workflow_runs (
    id TEXT PRIMARY KEY, tenant_id TEXT, workflow_id TEXT,
    inputs TEXT, outputs TEXT, status TEXT DEFAULT 'pending',
    node_results TEXT, started_at TEXT, completed_at TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS llm_metrics (
    id TEXT PRIMARY KEY, tenant_id TEXT, provider TEXT, model TEXT,
    prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER,
    cost_usd REAL, latency_ms INTEGER, prompt_id TEXT,
    timestamp TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS prompt_variants (
    id TEXT PRIMARY KEY, template_id TEXT, variant_label TEXT,
    content TEXT, score REAL DEFAULT 0, usage_count INTEGER DEFAULT 0,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_assets (
    id TEXT PRIMARY KEY, tenant_id TEXT, filename TEXT, path TEXT,
    mime_type TEXT, size_bytes INTEGER, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS rbac_permissions (
    id TEXT PRIMARY KEY, role_name TEXT, permission TEXT,
    resource TEXT, action TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS engrams (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    session_id TEXT,
    type TEXT DEFAULT 'episodic',
    content TEXT,
    summary TEXT,
    vector TEXT,
    importance REAL DEFAULT 1.0,
    confidence REAL DEFAULT 1.0,
    access_count INTEGER DEFAULT 0,
    last_accessed TEXT,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_engrams_user ON engrams (tenant_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engrams_session ON engrams (tenant_id, session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engrams_type ON engrams (tenant_id, user_id, type)`,
  `CREATE TABLE IF NOT EXISTS memory_summaries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    summary TEXT,
    based_on_count INTEGER,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_harness_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    agent_id TEXT,
    task_type TEXT,
    goal TEXT,
    steps TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS autonomous_hands (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT,
    schedule TEXT,
    goal TEXT,
    last_run TEXT,
    next_run TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ml_ticket_predictions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    ticket_id TEXT,
    predicted_category TEXT,
    predicted_priority TEXT,
    confidence REAL,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS memory_graph_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,
    from_id TEXT,
    to_id TEXT,
    relation TEXT,
    created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_graph ON memory_graph_edges (tenant_id, from_id, to_id)`,
  `CREATE TABLE IF NOT EXISTS a2a_tasks (
    id TEXT PRIMARY KEY, tenant_id TEXT, task_id TEXT, status TEXT DEFAULT 'submitted',
    sender TEXT, receiver TEXT, payload TEXT, artifacts TEXT, messages TEXT,
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_a2a_tasks ON a2a_tasks (tenant_id, task_id)`,
  `CREATE TABLE IF NOT EXISTS mcp_registry_servers (
    id TEXT PRIMARY KEY, name TEXT, url TEXT, capabilities TEXT, installed INTEGER DEFAULT 0, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS billing_usage (
    id TEXT PRIMARY KEY, tenant_id TEXT, resource TEXT, metric TEXT, quantity REAL, period TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_billing_usage ON billing_usage (tenant_id, resource, period)`,
  `CREATE TABLE IF NOT EXISTS workforce_assignments (
    id TEXT PRIMARY KEY, tenant_id TEXT, agent_id TEXT, task_type TEXT, priority INTEGER,
    required_skills TEXT, payload TEXT, result TEXT, status TEXT DEFAULT 'scheduled',
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workforce ON workforce_assignments (tenant_id, agent_id, status)`,
  `CREATE TABLE IF NOT EXISTS abac_policies (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, resource TEXT, action TEXT,
    conditions TEXT, effect TEXT DEFAULT 'allow', priority INTEGER DEFAULT 0, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_abac ON abac_policies (tenant_id, resource, action)`,
  `CREATE TABLE IF NOT EXISTS agent_eval_cases (
    id TEXT PRIMARY KEY, tenant_id TEXT, intent TEXT, payload TEXT, expected_keys TEXT, expected_value TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_eval_runs (
    id TEXT PRIMARY KEY, tenant_id TEXT, case_id TEXT, intent TEXT, passed INTEGER, result TEXT, duration_ms INTEGER, missing_keys TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_eval ON agent_eval_runs (tenant_id, case_id)`,
  `CREATE TABLE IF NOT EXISTS agent_policies (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, resource TEXT, action TEXT,
    conditions TEXT, effect TEXT DEFAULT 'allow', priority INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_policies ON agent_policies (tenant_id, resource, action, enabled)`,
  `CREATE TABLE IF NOT EXISTS policy_decisions (
    id TEXT PRIMARY KEY, tenant_id TEXT, policy_id TEXT, resource TEXT, action TEXT,
    context TEXT, decision TEXT, reason TEXT, created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_sandboxes (
    id TEXT PRIMARY KEY, tenant_id TEXT, agent_id TEXT, runtime TEXT, status TEXT,
    allow_network INTEGER DEFAULT 0, allowed_tools TEXT, resource_limits TEXT, env TEXT,
    output TEXT, error TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_sandboxes ON agent_sandboxes (tenant_id, status)`,
  `CREATE TABLE IF NOT EXISTS sandbox_executions (
    id TEXT PRIMARY KEY, sandbox_id TEXT, tenant_id TEXT, tool TEXT, args TEXT,
    result TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sandbox_execs ON sandbox_executions (sandbox_id, tenant_id)`,
  `CREATE TABLE IF NOT EXISTS causal_alerts (
    id TEXT PRIMARY KEY, tenant_id TEXT, metric TEXT, source TEXT,
    current_value REAL, baseline_value REAL, stddev REAL, z_score REAL,
    reason TEXT, severity TEXT, status TEXT DEFAULT 'open',
    created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_causal_alerts ON causal_alerts (tenant_id, status, severity)`,
  `CREATE TABLE IF NOT EXISTS causal_alert_correlations (
    id TEXT PRIMARY KEY, alert_id TEXT, related_source TEXT, correlation_score REAL, reason TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_causal_corr ON causal_alert_correlations (alert_id)`,
  `CREATE TABLE IF NOT EXISTS remediation_rules (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, trigger TEXT,
    condition TEXT, actions TEXT, enabled INTEGER DEFAULT 1,
    run_count INTEGER DEFAULT 0, last_run_at TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_remediation_rules ON remediation_rules (tenant_id, enabled)`,
  `CREATE TABLE IF NOT EXISTS remediation_runs (
    id TEXT PRIMARY KEY, tenant_id TEXT, rule_id TEXT, alert_id TEXT,
    status TEXT, output TEXT, error TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_remediation_runs ON remediation_runs (tenant_id, rule_id, status)`,
  `CREATE TABLE IF NOT EXISTS agent_cost_charges (
    id TEXT PRIMARY KEY, tenant_id TEXT, resource TEXT, resource_id TEXT,
    agent_id TEXT, session_id TEXT, metric TEXT, quantity REAL,
    rate REAL, cost REAL, metadata TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cost_charges ON agent_cost_charges (tenant_id, resource, agent_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS durable_executions (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, status TEXT DEFAULT 'pending',
    context TEXT, result TEXT, error TEXT, attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3, created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_durable_execs ON durable_executions (tenant_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS durable_execution_events (
    id TEXT PRIMARY KEY, execution_id TEXT, seq INTEGER,
    type TEXT, payload TEXT, result TEXT, error TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_durable_events ON durable_execution_events (execution_id, seq)`,
  `CREATE TABLE IF NOT EXISTS mcp_gateway_tools (
    id TEXT PRIMARY KEY, tenant_id TEXT, server_id TEXT, tool_name TEXT,
    enabled INTEGER DEFAULT 1, rate_limit_rpm INTEGER DEFAULT 60,
    cost_per_call REAL DEFAULT 0, metadata TEXT, created_at TEXT, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_gateway_tools ON mcp_gateway_tools (tenant_id, server_id, tool_name, enabled)`,
  `CREATE TABLE IF NOT EXISTS mcp_gateway_calls (
    id TEXT PRIMARY KEY, tenant_id TEXT, tool_id TEXT, server_id TEXT, tool_name TEXT,
    input TEXT, output TEXT, cost REAL, status TEXT, error TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_gateway_calls ON mcp_gateway_calls (tenant_id, tool_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS failure_predictions (
    id TEXT PRIMARY KEY, tenant_id TEXT, entity_type TEXT, entity_id TEXT, risk_score REAL,
    signals TEXT, recommended_action TEXT, confidence REAL, status TEXT, triggered_at TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_failure_predictions ON failure_predictions (tenant_id, entity_type, status, risk_score DESC)`,
  `CREATE TABLE IF NOT EXISTS failure_signals (
    id TEXT PRIMARY KEY, tenant_id TEXT, signal_type TEXT, entity_type TEXT, entity_id TEXT,
    value REAL, threshold REAL, raw TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_failure_signals ON failure_signals (tenant_id, signal_type, entity_type, created_at)`,
  `CREATE TABLE IF NOT EXISTS authz_relations (
    id TEXT PRIMARY KEY, tenant_id TEXT, object_type TEXT, object_id TEXT,
    relation TEXT, user_type TEXT, user_id TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_authz_relations ON authz_relations (tenant_id, object_type, object_id, relation, user_id)`,
  `CREATE TABLE IF NOT EXISTS authz_checkpoints (
    id TEXT PRIMARY KEY, tenant_id TEXT, object_type TEXT, object_id TEXT,
    zookie TEXT, created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_authz_checkpoints ON authz_checkpoints (tenant_id, object_type, object_id, zookie)`
];

for (const m of migrations) db.exec(m);

export default db;
export { db };
