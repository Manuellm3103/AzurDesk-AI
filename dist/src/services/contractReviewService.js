import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson } from './_utils.js';

export const RISK_CLAUSES = [
  {
    id: 'indemnity',
    name: 'Cláusula de indemnidad',
    patterns: [
      /indemnizar/i,
      /indemnidad/i,
      /mantener indemne/i,
      /resarcir daños/i,
      /responsabilidad ilimitada/i,
      /resarcimiento.*total/i,
      /perjuicios emergentes.*y.*lucro cesante/i
    ],
    weight: 0.85,
    severity: 'high'
  },
  {
    id: 'confidentiality',
    name: 'Confidencialidad estricta',
    patterns: [
      /confidencialidad.*ilimitada/i,
      /5 años.*confidencial/i,
      /por tiempo indefinido.*confidencial/i,
      /no divulgación.*posterior/i,
      /secreto.*perpetuo/i,
      /obligación de confidencialidad.*extendida/i
    ],
    weight: 0.65,
    severity: 'medium'
  },
  {
    id: 'termination',
    name: 'Rescisión unilateral/desproporcionada',
    patterns: [
      /rescindir sin causa/i,
      /terminación inmediata/i,
      /sin previo aviso/i,
      /cancelar sin responsabilidad/i,
      /causales de terminación.*exclusivas/i,
      /resolución del contrato.*unilateral/i,
      /caducidad.*sin notificación/i,
      /extinción anticipada.*ad libitum/i
    ],
    weight: 0.75,
    severity: 'high'
  },
  {
    id: 'ip_assignment',
    name: 'Asignación amplia de propiedad intelectual',
    patterns: [
      /titularidad absoluta/i,
      /cesión total.*derechos/i,
      /mora.*intelectual/i,
      /obras derivadas.*pertenecen/i,
      /sin contraprestación.*derechos/i,
      /propiedad intelectual.*en forma absoluta/i,
      /titularidad.*perpetua/i
    ],
    weight: 0.8,
    severity: 'high'
  },
  {
    id: 'exclusivity',
    name: 'Exclusividad amplia',
    patterns: [
      /exclusividad.*indefinida/i,
      /no competir.*3 años/i,
      /no prestar servicios.*terceros/i,
      /clientes actuales.*prohibido/i,
      /pacto de exclusividad.*amplio/i,
      /exclusividad.*territorio.*total/i,
      /no competencia.*indefinida/i
    ],
    weight: 0.7,
    severity: 'medium'
  },
  {
    id: 'penalties',
    name: 'Penalizaciones desproporcionadas',
    patterns: [
      /pena convencional.*\d+%/i,
      /multa.*mensualidad/i,
      /daños y perjuicios.*saldo/i,
      /cláusula penal.*excesiva/i,
      /penalización.*total del contrato/i,
      /pena.*equivalente.*\d+%/i
    ],
    weight: 0.6,
    severity: 'medium'
  },
  {
    id: 'liability_cap',
    name: 'Tope de responsabilidad bajo',
    patterns: [
      /responsabilidad máxima.*una mensualidad/i,
      /tope de responsabilidad.*\$\d{1,3}(,\d{3})*/i,
      /no seremos responsables.*consecuenciales/i,
      /limitación de responsabilidad.*total/i,
      /responsabilidad.*limitada.*1 mensualidad/i,
      /tope.*\d+\.?\d*.*veces.*mensualidad/i
    ],
    weight: 0.55,
    severity: 'medium'
  },
  {
    id: 'jurisdiction',
    name: 'Jurisdicción adversa',
    patterns: [
      /jurisdicción.*cualquier/i,
      /leyes aplicables.*excepto/i,
      /foro.*estado/i,
      /competente.*ciudad/i,
      /sumisión.*jurisdicción extranjera/i,
      /legislación extranjera.*aplicará/i
    ],
    weight: 0.45,
    severity: 'low'
  }
];

function scoreClause(text, clause) {
  let hits = 0;
  let matchedPatterns = [];
  for (const pattern of clause.patterns) {
    if (pattern.test(text)) {
      hits += 1;
      matchedPatterns.push(pattern.source);
    }
  }
  const density = hits / clause.patterns.length;
  const baseScore = hits > 0 ? clause.weight : 0;
  const bonus = Math.min(1 - baseScore, (hits - 1) * 0.08);
  const score = Math.min(1, baseScore + bonus);
  return {
    id: clause.id,
    name: clause.name,
    severity: clause.severity,
    hits,
    score,
    matched: matchedPatterns.length > 0,
    matchedPatterns: matchedPatterns.slice(0, 5),
    snippet: extractSnippet(text, clause.patterns[0])
  };
}

function extractSnippet(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index == null) return null;
  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + match[0].length + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function overallRiskLevel(score) {
  if (score >= 0.7) return 'critical';
  if (score >= 0.45) return 'high';
  if (score >= 0.25) return 'medium';
  return 'low';
}

const MAX_TEXT_LENGTH = 50000;

export function reviewContract({ tenant_id, case_id = null, title = '', text }) {
  if (!tenant_id) throw new Error('tenant_id es requerido');
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('text es requerido y no puede estar vacío');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`text excede longitud máxima de ${MAX_TEXT_LENGTH} caracteres`);
  }
  if (case_id) {
    const existingCase = db.prepare('SELECT id FROM legal_cases WHERE id = ? AND tenant_id = ?').get(case_id, tenant_id);
    if (!existingCase) throw new Error('case_id no existe en este tenant');
  }
  const findings = RISK_CLAUSES.map((clause) => scoreClause(text, clause));
  const activeFindings = findings.filter((f) => f.matched);
  const overallScore = activeFindings.length
    ? activeFindings.reduce((sum, f) => sum + f.score, 0) / activeFindings.length
    : 0;

  const id = randomUUID();
  const created_at = now();
  const risk_level = overallRiskLevel(overallScore);

  const metadata = {
    textLength: text.length,
    clausesScanned: RISK_CLAUSES.length,
    matchedCount: activeFindings.length
  };

  db.prepare(
    `INSERT INTO contract_reviews
      (id, tenant_id, case_id, title, text, overall_score, risk_level, findings, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tenant_id,
    case_id,
    title,
    text,
    overallScore,
    risk_level,
    JSON.stringify(activeFindings),
    JSON.stringify(metadata),
    created_at,
    created_at
  );

  return {
    id,
    tenant_id,
    case_id,
    title,
    overall_score: overallScore,
    risk_level: risk_level,
    findings,
    metadata,
    created_at
  };
}

export function listContractReviews({ tenant_id, case_id = null, limit = 50, offset = 0 }) {
  let sql = 'SELECT * FROM contract_reviews WHERE tenant_id = ?';
  const params = [tenant_id];
  if (case_id) {
    sql += ' AND case_id = ?';
    params.push(case_id);
  }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params).map(rowToReview);
}

export function getContractReview(id, tenant_id) {
  const row = db.prepare('SELECT * FROM contract_reviews WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  return row ? rowToReview(row) : null;
}

export function deleteContractReview(id, tenant_id) {
  const result = db.prepare('DELETE FROM contract_reviews WHERE id = ? AND tenant_id = ?').run(id, tenant_id);
  return result.changes > 0;
}

function rowToReview(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    case_id: row.case_id,
    title: row.title,
    overall_score: row.overall_score,
    risk_level: row.risk_level,
    findings: safeJson(row.findings, []),
    metadata: safeJson(row.metadata, {}),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export default {
  reviewContract,
  listContractReviews,
  getContractReview,
  deleteContractReview,
  RISK_CLAUSES
};
