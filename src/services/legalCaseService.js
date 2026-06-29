import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson } from './_utils.js';

const LEGAL_STATUS_FLOW = ['intake','review','discovery','negotiation','resolution','closed'];
const LEGAL_TYPES = ['contract', 'litigation', 'compliance', 'ip', 'employment', 'corporate'];
const LEGAL_PRIORITIES = ['low', 'medium', 'high', 'critical'];

class LegalCaseService {
  generateCaseNumber(tenant_id) {
    const year = new Date().getFullYear();
    const count = db.prepare('SELECT COUNT(*) c FROM legal_cases WHERE tenant_id = ? AND created_at LIKE ?').get(tenant_id, `${year}%`).c + 1;
    return `LEG-${year}-${String(count).padStart(4, '0')}`;
  }

  create(tenant_id, fields) {
    const id = randomUUID();
    const case_number = this.generateCaseNumber(tenant_id);
    const t = now();
    const risk = this.assessRisk(fields);
    const priority = this.inferPriority(fields, risk);
    const due = this.defaultDueDate(priority);
    const approval_level = this.requiredApprovalLevel(fields.type, fields.requested_amount);

    db.prepare(`INSERT INTO legal_cases
      (id, tenant_id, case_number, title, summary, type, subtype, status, priority, risk_score,
       requester_email, requester_name, owner_id, requested_amount, opposing_party, jurisdiction,
       filed_at, due_at, approval_level, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, tenant_id, case_number, fields.title, fields.summary, fields.type, fields.subtype || '',
      'intake', priority, risk, fields.requester_email || '', fields.requester_name || '',
      fields.owner_id || '', fields.requested_amount || 0, fields.opposing_party || '', fields.jurisdiction || '',
      t, due, approval_level, JSON.stringify(fields.tags || []), JSON.stringify(fields.metadata || {}), t, t
    );

    return { success: true, case: this.get(tenant_id, id) };
  }

  get(tenant_id, id) {
    const row = db.prepare('SELECT * FROM legal_cases WHERE tenant_id = ? AND id = ?').get(tenant_id, id);
    if (!row) return null;
    return this.hydrate(row);
  }

  list(tenant_id, { status, type, priority, owner_id, limit = 100, offset = 0 } = {}) {
    let sql = 'SELECT * FROM legal_cases WHERE tenant_id = ?';
    const params = [tenant_id];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (priority) { sql += ' AND priority = ?'; params.push(priority); }
    if (owner_id) { sql += ' AND owner_id = ?'; params.push(owner_id); }
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    return { success: true, cases: db.prepare(sql).all(...params, Number(limit), Number(offset)).map((r) => this.hydrate(r)) };
  }

  update(tenant_id, id, fields) {
    const c = this.get(tenant_id, id);
    if (!c) return { success: false, error: 'Caso no encontrado' };
    const t = now();
    db.prepare(`UPDATE legal_cases SET
      title=?, summary=?, type=?, subtype=?, status=?, priority=?, risk_score=?, owner_id=?,
      requested_amount=?, opposing_party=?, jurisdiction=?, due_at=?, approval_level=?, tags=?, metadata=?, updated_at=?
      WHERE tenant_id = ? AND id = ?`).run(
      fields.title ?? c.title, fields.summary ?? c.summary, fields.type ?? c.type,
      fields.subtype ?? c.subtype, fields.status ?? c.status, fields.priority ?? c.priority,
      fields.risk_score ?? c.risk_score, fields.owner_id ?? c.owner_id,
      fields.requested_amount ?? c.requested_amount, fields.opposing_party ?? c.opposing_party,
      fields.jurisdiction ?? c.jurisdiction, fields.due_at ?? c.due_at,
      fields.approval_level ?? c.approval_level, JSON.stringify(fields.tags ?? c.tags), JSON.stringify(fields.metadata ?? c.metadata), t, tenant_id, id
    );
    return { success: true, case: this.get(tenant_id, id) };
  }

  advanceStatus(tenant_id, id, actor) {
    const c = this.get(tenant_id, id);
    if (!c) return { success: false, error: 'Caso no encontrado' };
    const idx = LEGAL_STATUS_FLOW.indexOf(c.status);
    const next = LEGAL_STATUS_FLOW[Math.min(idx + 1, LEGAL_STATUS_FLOW.length - 1)];
    return this.update(tenant_id, id, { status: next });
  }

  approve(tenant_id, id, { approver_id, decision, notes }, actor) {
    const c = this.get(tenant_id, id);
    if (!c) return { success: false, error: 'Caso no encontrado' };
    const required = c.approval_level;
    const approver = db.prepare('SELECT level FROM users WHERE tenant_id = ? AND id = ?').get(tenant_id, approver_id);
    if (!approver || approver.level < required) return { success: false, error: `Aprobación requiere nivel legal ${required}` };

    db.prepare('INSERT INTO legal_approvals (id, tenant_id, case_id, level, approver_id, decision, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), tenant_id, id, required, approver_id, decision, notes || '', now());
    if (decision === 'approved') {
      db.prepare('UPDATE legal_cases SET approved_by = ?, approved_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?')
        .run(approver_id, now(), now(), tenant_id, id);
    }
    return { success: true, case: this.get(tenant_id, id) };
  }

  addTask(tenant_id, case_id, { title, description, due_at, assigned_to }) {
    const id = randomUUID();
    db.prepare('INSERT INTO legal_tasks (id, tenant_id, case_id, title, description, status, due_at, assigned_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, case_id, title, description || '', 'todo', due_at || null, assigned_to || '', now(), now());
    db.prepare('UPDATE legal_cases SET updated_at = ? WHERE tenant_id = ? AND id = ?').run(now(), tenant_id, case_id);
    return { success: true, task: this.getTask(tenant_id, id) };
  }

  getTask(tenant_id, id) {
    return db.prepare('SELECT * FROM legal_tasks WHERE tenant_id = ? AND id = ?').get(tenant_id, id);
  }

  listTasks(tenant_id, case_id) {
    return { success: true, tasks: db.prepare('SELECT * FROM legal_tasks WHERE tenant_id = ? AND case_id = ? ORDER BY created_at').all(tenant_id, case_id) };
  }

  addNote(tenant_id, case_id, { author_id, author_name, body, is_internal = true }) {
    const id = randomUUID();
    db.prepare('INSERT INTO legal_notes (id, tenant_id, case_id, author_id, author_name, body, is_internal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, case_id, author_id, author_name, body, Number(is_internal), now());
    db.prepare('UPDATE legal_cases SET updated_at = ? WHERE tenant_id = ? AND id = ?').run(now(), tenant_id, case_id);
    return { success: true, note: db.prepare('SELECT * FROM legal_notes WHERE id = ?').get(id) };
  }

  listNotes(tenant_id, case_id) {
    return { success: true, notes: db.prepare('SELECT * FROM legal_notes WHERE tenant_id = ? AND case_id = ? ORDER BY created_at DESC').all(tenant_id, case_id) };
  }

  addDocument(tenant_id, case_id, { filename, stored_name, doc_type, size, ext, text }) {
    const id = randomUUID();
    db.prepare('INSERT INTO legal_documents (id, tenant_id, case_id, filename, stored_name, doc_type, size, ext, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, tenant_id, case_id, filename, stored_name, doc_type || 'other', size || 0, ext || '', text || '', now());
    db.prepare('UPDATE legal_cases SET updated_at = ? WHERE tenant_id = ? AND id = ?').run(now(), tenant_id, case_id);
    return { success: true, document: db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id) };
  }

  listDocuments(tenant_id, case_id) {
    return { success: true, documents: db.prepare('SELECT * FROM legal_documents WHERE tenant_id = ? AND case_id = ? ORDER BY created_at DESC').all(tenant_id, case_id) };
  }

  hydrate(row) {
    return { ...row, tags: safeJson(row.tags, []), metadata: safeJson(row.metadata, {}) };
  }

  assessRisk(fields) {
    let score = 0;
    const text = `${fields.title || ''} ${fields.summary || ''}`.toLowerCase();
    const riskWords = ['litigio', 'demanda', 'demandado', 'multa', 'regulatorio', 'sancion', 'infraccion', 'fraude', 'incumplimiento', 'rescisión'];
    for (const w of riskWords) if (text.includes(w)) score += 0.12;
    if (fields.requested_amount > 100000) score += 0.25;
    else if (fields.requested_amount > 50000) score += 0.15;
    else if (fields.requested_amount > 10000) score += 0.08;
    if (fields.type === 'litigation') score += 0.2;
    if (fields.type === 'compliance') score += 0.15;
    return Math.min(1, Number(score.toFixed(3)));
  }

  inferPriority(fields, risk) {
    if (fields.priority && LEGAL_PRIORITIES.includes(fields.priority)) return fields.priority;
    if (risk >= 0.6 || fields.type === 'litigation') return 'critical';
    if (risk >= 0.35 || fields.type === 'compliance') return 'high';
    if (risk >= 0.15) return 'medium';
    return 'low';
  }

  defaultDueDate(priority) {
    const days = { low: 14, medium: 10, high: 5, critical: 2 };
    return new Date(Date.now() + (days[priority] || 14) * 86400000).toISOString();
  }

  requiredApprovalLevel(type, amount) {
    if (type === 'litigation' || amount > 50000) return 3;
    if (type === 'compliance' || amount > 10000) return 2;
    return 1;
  }
}

export default new LegalCaseService();
export { LEGAL_STATUS_FLOW, LEGAL_TYPES, LEGAL_PRIORITIES };
