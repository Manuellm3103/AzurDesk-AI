import assert from 'node:assert/strict';
import { test } from 'node:test';
import contractReviewService from '../src/services/contractReviewService.js';
import db from '../src/services/db.js';

const TENANT = 'tenant-contract-1';

function clean() {
  db.prepare('DELETE FROM contract_reviews WHERE tenant_id = ?').run(TENANT);
}

test('reviewContract detecta cláusulas de riesgo y calcula score global', () => {
  clean();
  const text = `
    CONTRATO DE SERVICIOS

    1. El proveedor se obliga a indemnizar al cliente por cualquier daño directo, indirecto o consecuencial,
       manteniéndolo indemne de toda responsabilidad legal.
    2. El cliente podrá rescindir el contrato sin causa y sin previo aviso en cualquier momento.
    3. Todos los derechos de propiedad intelectual generados durante la relación pertenecerán en forma absoluta
       y perpetua al cliente, sin contraprestación adicional.
    4. En caso de incumplimiento, el proveedor pagará una pena convencional equivalente al 50% del monto total.
  `;
  const r = contractReviewService.reviewContract({ tenant_id: TENANT, title: 'Contrato crítico', text });
  assert.equal(typeof r.id, 'string');
  assert.ok(r.overall_score > 0.4);
  assert.ok(['critical', 'high', 'medium'].includes(r.risk_level));
  const matched = r.findings.filter(f => f.matched);
  assert.ok(matched.length >= 3, `esperaba ≥3 hallazgos, obtuvo ${matched.length}`);
  const indemnity = r.findings.find(f => f.id === 'indemnity');
  assert.ok(indemnity?.matched);
  assert.ok(indemnity.score > 0);
  assert.ok(r.metadata.clausesScanned >= 8);
});

test('reviewContract con texto seguro devuelve score bajo', () => {
  clean();
  const text = 'Este contrato establece una relación comercial justa entre las partes, con términos equilibrados y mutuos derechos.';
  const r = contractReviewService.reviewContract({ tenant_id: TENANT, title: 'Contrato sencillo', text });
  assert.ok(r.overall_score < 0.3);
  assert.equal(r.risk_level, 'low');
  const matched = r.findings.filter(f => f.matched);
  assert.equal(matched.length, 0);
});

test('listContractReviews filtra por tenant y case_id', () => {
  clean();
  const caseA = `case-a-${Date.now()}`;
  const caseB = `case-b-${Date.now() + 1}`;
  db.prepare('INSERT INTO legal_cases (id, tenant_id, case_number, title, summary, type, status, priority, risk_score, approval_level, requester_email, requester_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(caseA, TENANT, 'LEG-A', 'Caso A', 'Resumen A', 'contract', 'intake', 'medium', 0.5, 2, 'a@corp.com', 'A', new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO legal_cases (id, tenant_id, case_number, title, summary, type, status, priority, risk_score, approval_level, requester_email, requester_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(caseB, TENANT, 'LEG-B', 'Caso B', 'Resumen B', 'contract', 'intake', 'medium', 0.5, 2, 'b@corp.com', 'B', new Date().toISOString(), new Date().toISOString());

  contractReviewService.reviewContract({ tenant_id: TENANT, case_id: caseA, title: 'A', text: 'indemnidad total' });
  contractReviewService.reviewContract({ tenant_id: TENANT, case_id: caseB, title: 'B', text: 'exclusividad indefinida' });
  contractReviewService.reviewContract({ tenant_id: TENANT, title: 'C', text: 'penalización del 30%' });

  const all = contractReviewService.listContractReviews({ tenant_id: TENANT });
  assert.equal(all.length, 3);

  const byCase = contractReviewService.listContractReviews({ tenant_id: TENANT, case_id: caseA });
  assert.equal(byCase.length, 1);
  assert.equal(byCase[0].case_id, caseA);
});

test('getContractReview devuelve revisión o null', () => {
  clean();
  const created = contractReviewService.reviewContract({ tenant_id: TENANT, title: 'X', text: 'indemnidad' });
  const r = contractReviewService.getContractReview(created.id, TENANT);
  assert.ok(r);
  assert.equal(r.id, created.id);
  assert.equal(r.title, 'X');
  const missing = contractReviewService.getContractReview('no-existe', TENANT);
  assert.equal(missing, null);
});

test('deleteContractReview elimina solo del tenant correcto', () => {
  clean();
  const created = contractReviewService.reviewContract({ tenant_id: TENANT, title: 'Y', text: 'indemnidad' });
  const deleted = contractReviewService.deleteContractReview(created.id, TENANT);
  assert.equal(deleted, true);
  const missing = contractReviewService.getContractReview(created.id, TENANT);
  assert.equal(missing, null);
});

test('reviewContract rechaza textos vacíos o muy largos', () => {
  clean();
  assert.throws(() => contractReviewService.reviewContract({ tenant_id: TENANT, text: '' }), /vacío/);
  assert.throws(() => contractReviewService.reviewContract({ tenant_id: TENANT, text: '   ' }), /vacío/);
  assert.throws(() => contractReviewService.reviewContract({ tenant_id: TENANT, text: 'a'.repeat(50001) }), /máxima/);
});

test('reviewContract rechaza case_id inexistente', () => {
  clean();
  assert.throws(() => contractReviewService.reviewContract({ tenant_id: TENANT, case_id: 'no-existe', title: 'X', text: 'indemnidad' }), /case_id no existe/);
});
