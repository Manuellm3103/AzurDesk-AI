import { fetch } from 'undici';
import db from './db.js';
import { now, safeJson } from './_utils.js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from 'crypto';

const CLOUD_API_KEY = process.env.OLLAMA_CLOUD_KEY || '';
const CLOUD_ENDPOINT = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://api.ollama.ai';

const ALGO = 'aes-256-gcm';
const MASTER_KEY = process.env.OLLAMA_CLOUD_MASTER_KEY || process.env.JWT_SECRET || 'azurdesk-cloud-key-32-chars-long!!';

function getKey() {
  return scryptSync(MASTER_KEY, 'azurdesk-salt', 32);
}

function encrypt(text) {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(text) {
  const [ivHex, authTagHex, encrypted] = text.split(':');
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

class OllamaCloudService {
  constructor(database = db) {
    this.db = database;
  }

  _account(tenant_id) {
    return this.db.prepare('SELECT * FROM ollama_cloud_accounts WHERE tenant_id = ?').get(tenant_id);
  }

  _client(tenant_id) {
    const account = this._account(tenant_id);
    if (!account || !account.api_key) return null;
    const key = decrypt(account.api_key);
    const endpoint = account.endpoint || CLOUD_ENDPOINT;
    return { key, endpoint, account };
  }

  // Surprising feature: "Sign in" with API key + nickname, validate immediately
  signIn(tenant_id, { api_key, email, nickname, endpoint = CLOUD_ENDPOINT }) {
    if (!api_key) return { success: false, error: 'API key requerida' };
    const existing = this._account(tenant_id);
    const id = existing?.id || randomUUID();
    this.db.prepare(`INSERT OR REPLACE INTO ollama_cloud_accounts
      (id, tenant_id, api_key, endpoint, email, nickname, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tenant_id, encrypt(api_key), endpoint, email || '', nickname || '', 'connected', now(), now());
    const check = this.checkConnection(tenant_id);
    if (!check.success) {
      this.db.prepare("UPDATE ollama_cloud_accounts SET status = 'disconnected', updated_at = ? WHERE tenant_id = ?").run(now(), tenant_id);
      return { success: false, error: 'No se pudo conectar a Ollama Cloud', detail: check.error };
    }
    return { success: true, account: { id, tenant_id, email, nickname, endpoint, status: 'connected', default_model: check.models?.[0]?.model_id } };
  }

  disconnect(tenant_id) {
    this.db.prepare("UPDATE ollama_cloud_accounts SET status = 'disconnected', updated_at = ? WHERE tenant_id = ?").run(now(), tenant_id);
    return { success: true };
  }

  async checkConnection(tenant_id) {
    const client = this._client(tenant_id);
    if (!client) return { success: false, error: 'Cuenta no configurada' };
    try {
      const r = await fetch(`${client.endpoint}/api/tags`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + client.key }
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const models = (data.models || []).map((m) => ({
        name: m.name,
        model_id: m.model || m.name,
        size: m.size ? String(Math.round(m.size / 1e9)) + 'GB' : '',
        description: m.details?.description || '',
        capabilities: JSON.stringify(m.details?.capabilities || [])
      }));
      this._syncModels(tenant_id, client.account.id, models);
      this.db.prepare("UPDATE ollama_cloud_accounts SET status = 'connected', last_check_at = ?, models = ?, updated_at = ? WHERE tenant_id = ?")
        .run(now(), JSON.stringify(models), now(), tenant_id);
      return { success: true, models, count: models.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  _syncModels(tenant_id, account_id, models) {
    this.db.prepare('DELETE FROM ollama_cloud_models WHERE tenant_id = ?').run(tenant_id);
    const stmt = this.db.prepare('INSERT INTO ollama_cloud_models (tenant_id, account_id, name, model_id, size, description, capabilities, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const m of models) {
      stmt.run(tenant_id, account_id, m.name, m.model_id, m.size, m.description, JSON.stringify(m.capabilities), now());
    }
  }

  listModels(tenant_id) {
    const rows = this.db.prepare('SELECT * FROM ollama_cloud_models WHERE tenant_id = ? ORDER BY name').all(tenant_id);
    return rows.map((r) => ({ ...r, capabilities: safeJson(r.capabilities, []) }));
  }

  getAccount(tenant_id) {
    const a = this._account(tenant_id);
    if (!a) return null;
    return {
      id: a.id, tenant_id: a.tenant_id, email: a.email, nickname: a.nickname,
      endpoint: a.endpoint, status: a.status, default_model: a.default_model,
      last_check_at: a.last_check_at, models: safeJson(a.models, [])
    };
  }

  setDefaultModel(tenant_id, model_id) {
    this.db.prepare('UPDATE ollama_cloud_accounts SET default_model = ?, updated_at = ? WHERE tenant_id = ?').run(model_id, now(), tenant_id);
    return { success: true };
  }

  async generate(tenant_id, { prompt, model_id, stream = false }) {
    const client = this._client(tenant_id);
    if (!client) return { success: false, error: 'Cuenta no conectada' };
    const selected = model_id || client.account.default_model;
    if (!selected) return { success: false, error: 'Selecciona un modelo por defecto' };
    const start = Date.now();
    try {
      const r = await fetch(`${client.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + client.key },
        body: JSON.stringify({ model: selected, prompt, stream })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const latency_ms = Date.now() - start;
      const cost_estimate = 0; // Cloud pricing not exposed; keep 0 for now
      db.prepare('INSERT INTO llm_routes (tenant_id, request_type, complexity, model, latency_ms, cost_estimate, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(tenant_id, 'ollama-cloud', 'medium', selected, latency_ms, cost_estimate, 1, now());
      return { success: true, provider: 'ollama-cloud', model: selected, text: data.response || '', latency_ms };
    } catch (e) {
      db.prepare('INSERT INTO llm_routes (tenant_id, request_type, complexity, model, latency_ms, cost_estimate, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(tenant_id, 'ollama-cloud', 'medium', selected || 'unknown', 0, 0, 0, now());
      return { success: false, error: e.message };
    }
  }
}

export default new OllamaCloudService();
export { OllamaCloudService };
