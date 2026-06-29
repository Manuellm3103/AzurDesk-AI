import db from './db.js';
import { classifyComplexity } from './_utils.js';

class CostRouterService {
  constructor() {
    this.thresholds = { simple: 0.3, complex: 0.7 };
  }

  classify(text) {
    const complexity = classifyComplexity(text);
    return { complexity, simple: complexity === 'low' };
  }

  estimateCost(tenant_id, provider_id, model_id, inputTokens, outputTokens) {
    const row = db.prepare('SELECT cost_per_1m FROM llm_providers WHERE tenant_id=? AND id=?').get(tenant_id, provider_id);
    const costPer1M = row?.cost_per_1m || 0;
    return costPer1M * ((inputTokens + outputTokens) / 1_000_000);
  }

  route({ tenant_id, text, availableModels = [] }) {
    const { complexity, simple } = this.classify(text);
    const sorted = [...availableModels].sort((a, b) => (a.cost_per_1m || 0) - (b.cost_per_1m || 0));
    const cheap = sorted[0];
    const quality = [...availableModels].sort((a, b) => (b.quality || 0) - (a.quality || 0))[0];
    const choice = simple ? cheap : quality;
    return {
      complexity,
      simple,
      provider_id: choice?.provider_id,
      model_id: choice?.model_id,
      estimated_cost_1m_tokens: choice?.cost_per_1m || 0,
      rationale: simple ? 'low complexity -> cheapest model' : 'high complexity -> best quality model',
      alternatives: { cheap, quality }
    };
  }
}

export default new CostRouterService();
