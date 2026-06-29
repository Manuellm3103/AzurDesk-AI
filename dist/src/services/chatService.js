import { WebSocketServer } from 'ws';
import db from './db.js';
import { randomUUID } from 'crypto';
import { now, safeJson } from './_utils.js';
import { analyzeText } from '../ml/ticketClassifier.js';
import generativeAI from '../generative/generativeAIService.js';

class ChatService {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws/chat' });
    this.sessions = new Map();
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  handleConnection(ws) {
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const { tenant_id, session_id, user_email, content, handoff } = msg;
        let session = this.sessions.get(session_id) || db.prepare('SELECT * FROM chat_sessions WHERE id=?').get(session_id);
        if (!session) {
          const id = session_id || randomUUID();
          db.prepare('INSERT INTO chat_sessions (id, tenant_id, user_email, status, handoff_level, last_heartbeat_at, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            id, tenant_id, user_email, 'active', 0, now(), JSON.stringify({}), now(), now()
          );
          session = { id, tenant_id, user_email, status: 'active', handoff_level: 0, stalled_count: 0, context: '{}' };
          this.sessions.set(id, session);
        } else {
          this.sessions.set(session_id, session);
        }
        // heartbeat on every message
        const hb = now();
        db.prepare('UPDATE chat_sessions SET last_heartbeat_at=?, stalled_count=0 WHERE id=?').run(hb, session.id);
        session.last_heartbeat_at = hb;

        if (handoff) {
          db.prepare('UPDATE chat_sessions SET handoff_level=?, status=?, updated_at=? WHERE id=?').run(handoff, 'handoff', now(), session.id);
          ws.send(JSON.stringify({ type: 'system', text: `Escalado a nivel ${handoff}. Un agente humano se unirá pronto.` }));
          return;
        }

        const analysis = analyzeText(content);
        db.prepare('INSERT INTO chat_messages (id, session_id, role, content, intent, sentiment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          randomUUID(), session.id, 'user', content, analysis.priority, analysis.sentiment.comparative, now()
        );

        let replyText;
        if (analysis.priority === 'critica' || analysis.sentiment.comparative < -0.5) {
          db.prepare('UPDATE chat_sessions SET handoff_level=?, status=?, updated_at=? WHERE id=?').run(2, 'handoff', now(), session.id);
          replyText = 'Detecto urgencia. Escalo tu caso a un agente especialista. Por favor mantén el chat abierto.';
        } else {
          const gen = await generativeAI.generateReply({
            tenant_id, subject: content.slice(0, 60), body: content,
            category: 'general', priority: analysis.priority, level: 1
          });
          replyText = gen.reply;
        }

        db.prepare('INSERT INTO chat_messages (id, session_id, role, content, intent, sentiment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          randomUUID(), session.id, 'assistant', replyText, 'reply', 0, now()
        );
        ws.send(JSON.stringify({ type: 'assistant', text: replyText, analysis }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', text: 'No pude procesar el mensaje.' }));
      }
    });
  }

  listSessions({ tenant_id, status, limit = 50 } = {}) {
    let sql = 'SELECT * FROM chat_sessions WHERE 1=1';
    const params = [];
    if (tenant_id) { sql += ' AND tenant_id=?'; params.push(tenant_id); }
    if (status) { sql += ' AND status=?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    return { success: true, sessions: db.prepare(sql).all(...params, Number(limit)).map((s) => ({ ...s, context: safeJson(s.context, {}) })) };
  }
}

export default ChatService;
