import * as hybridRAG from './hybridRAGService.js';

// Agentic RAG: decompose a query into plan + retrieve + evaluate + synthesize.
class AgenticRAGService {
  async search({ tenant_id, query, max_sources = 5 }) {
    // Step 1: Plan — decide what sub-questions to ask
    const plan = [
      { id: 'primary', query, weight: 1.0 },
      { id: 'expanded', query: query + ' resumen paso a paso', weight: 0.7 }
    ];
    // Step 2: Retrieve from hybrid RAG for each sub-query
    const sources = [];
    for (const p of plan) {
      const hits = hybridRAG.hybridSearch({ tenant_id, query: p.query, limit: max_sources });
      for (const h of hits) {
        sources.push({ ...h, subquery: p.id, weight: p.weight });
      }
    }
    // Step 3: Evaluate / deduplicate by content similarity (simple id dedup)
    const seen = new Set();
    const unique = [];
    for (const s of sources) {
      const key = s.content || s.text || JSON.stringify(s);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    // Step 4: Synthesize — return ranked sources plus a generated summary stub
    const ranked = unique.slice(0, max_sources);
    const summary = ranked.length
      ? `Encontré ${ranked.length} fuentes relevantes para "${query}". La primera es: ${(ranked[0].content || ranked[0].text || '').substring(0, 120)}...`
      : 'No se encontraron fuentes relevantes.';
    return { success: true, query, plan: plan.map(p => p.query), sources: ranked, summary };
  }
}

export default new AgenticRAGService();
