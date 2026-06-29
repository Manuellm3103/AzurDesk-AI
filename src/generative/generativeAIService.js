import { analyzeText } from '../ml/ticketClassifier.js';
import { findSimilarArticles } from '../ml/similaritySearch.js';
import { generateEmbedding, saveEmbedding } from '../ml/similaritySearch.js';
import db from '../services/db.js';
import { now, safeJson } from '../services/_utils.js';
import { randomUUID } from 'crypto';

class GenerativeAIService {
  constructor() {
    this.prompts = {
      reply: (ctx) => `Eres un agente de soporte técnico de nivel ${ctx.level} de AzurDesk AI. Responde de forma clara, profesional y concisa al siguiente ticket. Si no tienes certeza, pide más información.\nCategoría: ${ctx.category}\nPrioridad: ${ctx.priority}\nAsunto: ${ctx.subject}\nDescripción: ${ctx.body}\n\nRespuesta sugerida:`,
      kb: (ctx) => `Resume el siguiente contenido técnico como un artículo de base de conocimiento conciso en español:\n${ctx.text}\n\nTítulo:`,
      summary: (ctx) => `Resume en 3 viñetas breves la siguiente conversación de soporte:\n${ctx.history}\n\nResumen:`
    };
  }

  async generateReply({ subject, body, category, priority, level, tenant_id }) {
    const start = Date.now();
    // RAG: buscar KB similar
    const kb = findSimilarArticles({ tenant_id, query: `${subject} ${body}`, limit: 3 });
    const kbContext = kb.map((k) => `${k.title}: ${k.content.slice(0, 200)}`).join('\n');
    const prompt = this.prompts.reply({ subject, body, category, priority, level });

    // Simulación de LLM local/cloud con respuesta estructurada
    const reply = this.simulateLLM(prompt, { kbContext, subject, body });
    const latency = Date.now() - start;
    this.logAI(tenant_id, 'reply', `${subject}\n${body}`, reply, 'azurdesk-local-v1', latency, 0.82);
    return { success: true, reply, sources: kb.filter((k) => k.score > 0.05), latency_ms: latency };
  }

  async generateKBArticle({ title, content, tenant_id }) {
    const start = Date.now();
    const prompt = this.prompts.kb({ text: content });
    const generated = this.simulateLLM(prompt, { title, content });
    const id = randomUUID();
    db.prepare('INSERT INTO kb_articles (id, tenant_id, title, content, category, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, tenant_id, generated.title || title, generated.content || content, 'auto', JSON.stringify(generated.tags || []), now(), now()
    );
    saveEmbedding(id, `${generated.title || title} ${generated.content || content}`);
    const latency = Date.now() - start;
    this.logAI(tenant_id, 'kb', content, JSON.stringify(generated), 'azurdesk-local-v1', latency, 0.75);
    return { success: true, article: { id, title: generated.title || title, content: generated.content || content }, latency_ms: latency };
  }

  async summarizeTicket({ ticket_id, tenant_id }) {
    const comments = db.prepare('SELECT * FROM ticket_comments WHERE ticket_id=? ORDER BY created_at').all(ticket_id);
    const history = comments.map((c) => `${c.author_name}: ${c.body}`).join('\n');
    const prompt = this.prompts.summary({ history });
    const summary = this.simulateLLM(prompt, { ticket_id });
    const latency = Date.now() - start;
    this.logAI(tenant_id, 'summary', history, summary, 'azurdesk-local-v1', latency, 0.78);
    return { success: true, summary, latency_ms: latency };
  }

  simulateLLM(prompt, ctx) {
    // Fallback deterministico local sin depender de Ollama/cloud
    if (prompt.includes('Respuesta sugerida')) {
      const { subject, body } = ctx;
      const lower = `${subject} ${body}`.toLowerCase();
      if (lower.includes('login') || lower.includes('acceso') || lower.includes('password')) {
        return 'Para restablecer tu acceso, verifica que tu email esté correcto, intenta recuperación de contraseña y, si persiste, un agente de L2 revisará los logs de autenticación.';
      }
      if (lower.includes('lento') || lower.includes('performance')) {
        return 'Revisaremos métricas de latencia y carga del servicio. Mientras tanto, ¿puedes indicarnos la hora exacta y el módulo afectado?';
      }
      return `Gracias por contactar a AzurDesk AI. Hemos recibido tu solicitud sobre "${subject}". Un agente de nivel ${ctx.level || 1} la está revisando y te responderá dentro del SLA correspondiente.`;
    }
    if (prompt.includes('Título:')) {
      return { title: `KB: ${ctx.title || 'Nuevo artículo'}`, content: `Resumen generado automáticamente:\n${ctx.content?.slice(0, 400) || 'Sin contenido'}`, tags: ['auto', 'ai'] };
    }
    return 'Resumen: 1) Cliente reporta incidente. 2) Se recopilaron detalles iniciales. 3) Pendiente de resolución por agente asignado.';
  }

  logAI(tenant_id, type, input, output, model, latency_ms, confidence) {
    db.prepare('INSERT INTO ai_logs (tenant_id, type, input, output, model, latency_ms, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      tenant_id, type, input.slice(0, 2000), output.slice(0, 2000), model, latency_ms, confidence, now()
    );
  }

  listLogs({ tenant_id, limit = 50 } = {}) {
    let sql = 'SELECT * FROM ai_logs';
    const params = [];
    if (tenant_id) { sql += ' WHERE tenant_id=?'; params.push(tenant_id); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    return { success: true, logs: db.prepare(sql).all(...params, Number(limit)) };
  }
}

export default new GenerativeAIService();
