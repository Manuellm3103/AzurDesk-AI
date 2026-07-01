import graphRAG from '../ml/graphRAG.js';
import engramService from './engramService.js';
import { findSimilarArticles } from '../ml/similaritySearch.js';
import embeddingService from './embeddingService.js';

export function hybridSearch({ tenant_id, user_id, query, topK = 5 }) {
  const results = [];
  const kb = graphRAG.search({ tenant_id, query, limit: topK });
  for (const k of kb) results.push({ source: 'kb', id: k.article_id, score: k.score, matched: k.matched });
  const mem = engramService.recall({ tenant_id, user_id, query, topK });
  for (const m of mem) results.push({ source: 'memory', id: m.id, score: m.score, content: m.content, type: m.type });
  const vec = findSimilarArticles({ tenant_id, query, limit: topK });
  for (const v of vec) results.push({ source: 'vector', id: v.id, score: v.score, title: v.title });
  // v2.6.13 — HNSW source (kNN aproximado, escala a grandes corpus)
  const stats = embeddingService.stats(tenant_id);
  const useHnsw = stats.total > 50; // HNSW gana con N>50
  const hnswRes = useHnsw
    ? embeddingService.hnswSearch(tenant_id, { query, k: topK, ef: 50 })
    : embeddingService.search(tenant_id, { query, k: topK });
  for (const h of hnswRes) results.push({ source: 'hnsw', id: h.id, score: h.score, text: h.text, algo: useHnsw ? 'hnsw' : 'exact' });
  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
