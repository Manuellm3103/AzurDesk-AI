import Sentiment from 'sentiment';

const sentiment = new Sentiment();

const URGENCY_WORDS = ['urgente', 'critico', 'critical', 'critica', 'down', 'caido', 'caído', 'no puedo', 'bloqueado', 'seguridad', 'hackeado', 'filtrado', 'caída', 'caído', 'desconectado', 'error 500', 'no funciona', 'parado'];
const HIGH_CATEGORIES = ['seguridad', 'infraestructura', 'red', 'acceso', 'auth'];

function normalize(text) {
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function classifyPriority({ subject = '', body = '', sentiment: sent }) {
  const text = normalize(`${subject} ${body}`);
  const urgencyScore = URGENCY_WORDS.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);
  const negative = sent?.comparative < -0.2 ? 1 : 0;
  if (urgencyScore >= 2 || negative) return 'critica';
  if (urgencyScore >= 1) return 'alta';
  return 'media';
}

export function routeToLevel({ category = 'general', sentiment: sent, priority = 'media' }) {
  if (HIGH_CATEGORIES.includes(category.toLowerCase()) || priority === 'critica' || sent?.comparative < -0.4) return 3;
  if (priority === 'alta' || sent?.comparative < -0.15) return 2;
  return 1;
}

export function predictEscalation({ subject = '', body = '', sentiment: sent, priority = 'media', level = 1 }) {
  const text = normalize(`${subject} ${body}`);
  const urgent = URGENCY_WORDS.filter((w) => text.includes(w)).length;
  const neg = Math.abs(Math.min(0, sent?.comparative || 0));
  const levelWeight = level >= 2 ? 0.2 : 0;
  let risk = Math.min(1, (urgent * 0.12) + (neg * 0.5) + (priority === 'critica' ? 0.3 : priority === 'alta' ? 0.15 : 0) + levelWeight);
  return Number(risk.toFixed(3));
}

export function analyzeText(text) {
  const sent = sentiment.analyze(text || '');
  return { sentiment: sent, priority: classifyPriority({ body: text, sentiment: sent }), escalationRisk: predictEscalation({ body: text, sentiment: sent }) };
}
