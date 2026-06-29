import natural from 'natural';
export { natural };
import db from '../services/db.js';
import { safeJson } from '../services/_utils.js';

const tokenizer = new natural.WordTokenizer();
const stemEs = natural.PorterStemmerEs;
const stemEn = natural.PorterStemmer;

function normalize(text) {
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(text) {
  const tokens = tokenizer.tokenize(normalize(text));
  return (tokens || []).map((t) => {
    const es = stemEs.stem(t);
    const en = stemEn.stem(t);
    return es === t ? (en === t ? t : en) : es;
  });
}

function vectorize(tokens, vocab) {
  const vec = new Array(vocab.length).fill(0);
  for (const t of tokens) {
    const i = vocab.indexOf(t);
    if (i >= 0) vec[i] += 1;
  }
  return vec;
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export function buildVocab(docs) {
  const set = new Set();
  for (const d of docs) tokenize(d).forEach((t) => set.add(t));
  return Array.from(set);
}

export function findSimilarArticles({ tenant_id, query, limit = 5 }) {
  const articles = db.prepare('SELECT * FROM kb_articles WHERE tenant_id=?').all(tenant_id);
  const docs = articles.map((a) => `${a.title} ${a.content} ${(safeJson(a.tags, []) || []).join(' ')}`);
  const vocab = buildVocab([...docs, query]);
  const qVec = vectorize(tokenize(query), vocab);
  const scored = articles.map((a, idx) => ({
    ...a,
    score: cosineSimilarity(qVec, vectorize(tokenize(docs[idx]), vocab))
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function generateEmbedding(text) {
  const tokens = tokenize(text);
  const vocab = buildVocab([text]);
  return vectorize(tokens, vocab);
}

export function saveEmbedding(articleId, text) {
  const emb = generateEmbedding(text);
  db.prepare('UPDATE kb_articles SET embedding=? WHERE id=?').run(JSON.stringify(emb), articleId);
}
