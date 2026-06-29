export const now = () => new Date().toISOString();

export function safeJson(s, fallback = null) {
  if (s == null) return fallback;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function average(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function randomId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseJsonRobust(text, fallback = null) {
  if (!text) return fallback;
  const clean = String(text).replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = safeJson(clean, null);
  if (parsed) return parsed;
  const match = clean.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  return match ? safeJson(match[0], fallback) : fallback;
}

const HIGH_SIGNALS = ['root cause','architecture','refactor','security audit','design','complex','multi-step','orchestrate','investigate deeply','code review','migrate','tokenize','train model','graphrag'];
const LOW_SIGNALS = ['summarize','greeting','short','one line','yes/no',' classify','simple','status','hello','hola','brevemente','resumen'];

export function classifyComplexity(prompt = '') {
  const p = prompt.toLowerCase();
  if (HIGH_SIGNALS.some((s) => p.includes(s))) return 'high';
  if (LOW_SIGNALS.some((s) => p.includes(s))) return 'low';
  return 'medium';
}
