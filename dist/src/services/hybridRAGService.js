import graphRAG from '../ml/graphRAG.js';
import engramService from './engramService.js';
import { findSimilarArticles } from '../ml/similaritySearch.js';

export function hybridSearch({ tenant_id, user_id, query, topK = 5 }) {
  const results = [];
  const kb = graphRAG.search({ tenant_id, query, limit: topK });
  for (const k of kb) results.push({ source: 'kb', id: k.article_id, score: k.score, matched: k.matched });
  const mem = engramService.recall({ tenant_id, user_id, query, topK });
  for (const m of mem) results.push({ source: 'memory', id: m.id, score: m.score, content: m.content, type: m.type });
  const vec = findSimilarArticles({ tenant_id, query, limit: topK });
  for (const v of vec) results.push({ source: 'vector', id: v.id, score: v.score, title: v.title });
  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
