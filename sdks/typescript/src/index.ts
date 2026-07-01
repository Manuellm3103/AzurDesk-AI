// AzurDesk AI AaaS — TypeScript SDK (Node 18+, ESM, zero dependencies).
// Mirror of the Python SDK. Types for all responses, automatic retry on 429/5xx.

export interface ApiKey {
  id: string;
  tenant_id?: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  enabled: boolean;
  created_at?: string;
  last_used_at?: string | null;
}

export interface UsageStats {
  api_key_id: string;
  period: string;
  used: number;
  limit: number;
  remaining: number;
}

export interface Model {
  id: string;
  provider?: string;
  kind?: string;
  cost_per_1k_input?: number;
  cost_per_1k_output?: number;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  author?: string;
  version?: string;
  kind?: string;
  category?: string;
  description?: string;
  rating_avg?: number;
  rating_count?: number;
  install_count?: number;
}

export interface GenerateRequest {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  fallback?: boolean;
}

export interface GenerateResponse {
  success: boolean;
  text?: string;
  provider?: string;
  model?: string;
  api_version?: string;
  error?: string;
  message?: string;
  latency_ms?: number;
}

export interface AzurDeskOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export class AzurDeskError extends Error {
  statusCode?: number;
  errorCode?: string;
  constructor(message: string, statusCode?: number, errorCode?: string) {
    super(message);
    this.name = 'AzurDeskError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export class AzurDeskAuthError extends AzurDeskError {
  constructor(message: string, errorCode?: string) {
    super(message, 401, errorCode);
    this.name = 'AzurDeskAuthError';
  }
}

export class AzurDeskRateLimitError extends AzurDeskError {
  constructor(message: string, errorCode?: string) {
    super(message, 429, errorCode);
    this.name = 'AzurDeskRateLimitError';
  }
}

export class AzurDeskQuotaError extends AzurDeskError {
  constructor(message: string, errorCode?: string) {
    super(message, 402, errorCode);
    this.name = 'AzurDeskQuotaError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AzurDeskClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(opts: AzurDeskOptions) {
    if (!opts.apiKey) throw new Error('apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.azurdesk.ai/v1').replace(/\/+$/, '');
    this.timeout = opts.timeout ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v != null) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeout);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'User-Agent': 'azurdesk-typescript-sdk/1.0',
            ...(body ? { 'Content-Type': 'application/json' } : {})
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.status === 200 || res.status === 201) {
          return (await res.json()) as T;
        }
        if (res.status === 401) {
          const e = await res.json().catch(() => ({}));
          throw new AzurDeskAuthError(e.message ?? 'Invalid API key', e.error);
        }
        if (res.status === 402) {
          const e = await res.json().catch(() => ({}));
          throw new AzurDeskQuotaError(e.message ?? 'Monthly quota exceeded', e.error);
        }
        if (res.status === 429) {
          if (attempt < this.maxRetries) {
            const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
            await sleep(Math.min(retryAfter, 10) * (attempt + 1));
            continue;
          }
          const e = await res.json().catch(() => ({}));
          throw new AzurDeskRateLimitError(e.message ?? 'Rate limit exceeded', e.error);
        }
        if (res.status >= 500) {
          if (attempt < this.maxRetries) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          const e = await res.json().catch(() => ({}));
          throw new AzurDeskError(e.message ?? `Server error ${res.status}`, res.status);
        }
        const e = await res.json().catch(() => ({}));
        throw new AzurDeskError(e.message ?? `HTTP ${res.status}`, res.status, e.error);
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof AzurDeskError) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
          if (attempt < this.maxRetries) continue;
          throw new AzurDeskError('Request timed out');
        }
        if (attempt < this.maxRetries) continue;
        throw new AzurDeskError((err as Error).message);
      }
    }
    throw new AzurDeskError('Max retries exceeded');
  }

  async health(): Promise<{ status: string; api: string; version: string; api_version: string }> {
    return this.request('GET', '/health');
  }

  async listModels(): Promise<Model[]> {
    const data = await this.request<{ models: Model[] }>('GET', '/aaas/models');
    return data.models ?? [];
  }

  async generate(prompt: string, opts: Partial<GenerateRequest> = {}): Promise<GenerateResponse> {
    return this.request<GenerateResponse>('POST', '/aaas/generate', { prompt, ...opts });
  }

  async generateChat(messages: Array<{ role: string; content: string }>, opts: Partial<GenerateRequest> = {}): Promise<GenerateResponse> {
    return this.request<GenerateResponse>('POST', '/aaas/generate', { messages, ...opts });
  }

  async usage(): Promise<UsageStats> {
    return this.request<UsageStats>('GET', '/aaas/usage');
  }

  async listProviders(): Promise<Array<Record<string, unknown>>> {
    const data = await this.request<{ providers: Array<Record<string, unknown>> }>('GET', '/aaas/providers');
    return data.providers ?? [];
  }

  async listApiKeys(): Promise<ApiKey[]> {
    const data = await this.request<{ keys: ApiKey[] }>('GET', '/api-keys');
    return data.keys ?? [];
  }

  async createApiKey(name: string, environment: 'live' | 'test' = 'live'): Promise<ApiKey> {
    const data = await this.request<{ key: ApiKey }>('POST', '/api-keys', { name, environment });
    return data.key;
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const data = await this.request<{ success: boolean }>('DELETE', `/api-keys/${id}`);
    return !!data.success;
  }

  async browseMarketplace(opts: { q?: string; category?: string; kind?: string; limit?: number } = {}): Promise<Skill[]> {
    const data = await this.request<{ skills: Skill[] }>('GET', '/marketplace', undefined, opts);
    return data.skills ?? [];
  }

  async installedSkills(): Promise<Skill[]> {
    const data = await this.request<{ skills: Skill[] }>('GET', '/marketplace/installed');
    return data.skills ?? [];
  }

  async listPlans(): Promise<Array<Record<string, unknown>>> {
    const data = await this.request<{ plans: Array<Record<string, unknown>> }>('GET', '/billing/plans');
    return data.plans ?? [];
  }

  async getSubscription(): Promise<Record<string, unknown> | null> {
    const data = await this.request<{ subscription: Record<string, unknown> | null }>('GET', '/billing/subscription');
    return data.subscription;
  }

  async subscribe(planId: string): Promise<{ subscription: Record<string, unknown>; plan: Record<string, unknown> }> {
    return this.request('POST', '/billing/subscription', { plan_id: planId });
  }

  async cancelSubscription(): Promise<{ cancelled: boolean }> {
    return this.request('DELETE', '/billing/subscription');
  }
}

export default AzurDeskClient;
