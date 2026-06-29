import db from './db.js';
import { now, safeJson, randomId } from './_utils.js';

export function createVariant(template_id, variant_label, content) {
  if (!template_id || !variant_label || !content) throw new Error('template_id, variant_label y content requeridos');
  const id = randomId('variant');
  db.prepare('INSERT INTO prompt_variants (id, template_id, variant_label, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, template_id, variant_label, content, now());
  return { id, template_id, variant_label, content, score: 0, usage_count: 0 };
}

export function listVariants(template_id) {
  return db.prepare('SELECT * FROM prompt_variants WHERE template_id = ? ORDER BY score DESC, usage_count DESC').all(template_id);
}

export function pickVariant(template_id) {
  const variants = listVariants(template_id);
  if (!variants.length) return null;
  // Pick best scoring with at least 3 samples, else pick least-used for exploration
  const mature = variants.filter(v => v.usage_count >= 3);
  if (mature.length) {
    mature.sort((a, b) => (b.score || 0) - (a.score || 0));
    return mature[0];
  }
  variants.sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));
  return variants[0];
}

export function recordUsage(variant_id) {
  db.prepare('UPDATE prompt_variants SET usage_count = usage_count + 1 WHERE id = ?').run(variant_id);
}

export function recordFeedback(variant_id, rating) {
  // Bayesian-like incremental score: 0-5 rating updates running average
  const variant = db.prepare('SELECT score, usage_count FROM prompt_variants WHERE id = ?').get(variant_id);
  if (!variant) throw new Error('Variant no encontrada');
  const n = variant.usage_count || 1;
  const oldScore = variant.score || 0;
  const newScore = (oldScore * (n - 1) + rating) / n;
  db.prepare('UPDATE prompt_variants SET score = ? WHERE id = ?').run(newScore, variant_id);
  return { ...variant, score: newScore };
}

export function getBestVariant(template_id) {
  const variants = listVariants(template_id);
  variants.sort((a, b) => (b.score || 0) - (a.score || 0));
  return variants[0] || null;
}

export default { createVariant, listVariants, pickVariant, recordUsage, recordFeedback, getBestVariant };