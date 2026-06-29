import assert from 'node:assert/strict';
import { test } from 'node:test';
import legalCaseService, { LEGAL_STATUS_FLOW } from '../src/services/legalCaseService.js';
import db from '../src/services/db.js';

const TENANT = 'tenant-legal-1';

function clean() {
  db.prepare('DELETE FROM legal_cases WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM legal_tasks WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM legal_notes WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM legal_approvals WHERE tenant_id = ?').run(TENANT);
  db.prepare('DELETE FROM users WHERE tenant_id = ? AND email LIKE ?').run(TENANT, 'legal-%');
}

test('create genera un caso legal con número, riesgo y prioridad inferidos', () => {
  clean();
  const r = legalCaseService.create(TENANT, {
    title: 'Demanda laboral por despido injustificado',
    summary: 'Ex empleado demanda indemnización por despido sin causa. Riesgo alto de litigio.',
    type: 'litigation',
    requester_email: 'rrhh@corp.com',
    requester_name: 'RRHH',
    requested_amount: 120000,
    opposing_party: 'Juan Pérez',
    jurisdiction: 'CDMX'
  });
  assert.equal(r.success, true);
  assert.ok(r.case.case_number.startsWith('LEG-'));
  assert.equal(r.case.status, 'intake');
  assert.equal(r.case.priority, 'critical');
  assert.ok(r.case.risk_score > 0.5);
  assert.equal(r.case.approval_level, 3);
});

test('advanceStatus avanza por el flujo legal', () => {
  clean();
  const c = legalCaseService.create(TENANT, { title: 'Contrato', summary: 'Revisión de contrato', type: 'contract' });
  const id = c.case.id;
  let current = 'intake';
  for (const next of LEGAL_STATUS_FLOW.slice(1)) {
    const r = legalCaseService.advanceStatus(TENANT, id);
    assert.equal(r.success, true);
    assert.equal(r.case.status, next);
    current = next;
  }
});

test('approve rechaza si el aprobador no tiene nivel suficiente', () => {
  clean();
  db.prepare('INSERT INTO users (id, tenant_id, name, email, password_hash, role, level, skills, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('junior', TENANT, 'Junior', 'legal-junior@corp.com', 'x', 'legal', 1, '[]', new Date().toISOString());
  const c = legalCaseService.create(TENANT, { title: 'Demanda', summary: 'Litigio', type: 'litigation', requested_amount: 120000 });
  const r = legalCaseService.approve(TENANT, c.case.id, { approver_id: 'junior', decision: 'approved' });
  assert.equal(r.success, false);
});

test('approve aprueba con aprobador de nivel suficiente', () => {
  clean();
  db.prepare('INSERT INTO users (id, tenant_id, name, email, password_hash, role, level, skills, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('partner', TENANT, 'Partner', 'legal-partner@corp.com', 'x', 'legal', 3, '[]', new Date().toISOString());
  const c = legalCaseService.create(TENANT, { title: 'Demanda', summary: 'Litigio', type: 'litigation', requested_amount: 120000 });
  const r = legalCaseService.approve(TENANT, c.case.id, { approver_id: 'partner', decision: 'approved', notes: 'Aprobado para proceder' });
  assert.equal(r.success, true);
  assert.equal(r.case.approved_by, 'partner');
});

test('addTask y listTasks funcionan', () => {
  clean();
  const c = legalCaseService.create(TENANT, { title: 'Contrato', summary: 'Revisión', type: 'contract' });
  const t = legalCaseService.addTask(TENANT, c.case.id, { title: 'Revisar cláusulas', description: 'Cláusulas de confidencialidad', assigned_to: 'abogado1' });
  assert.equal(t.success, true);
  const list = legalCaseService.listTasks(TENANT, c.case.id);
  assert.equal(list.tasks.length, 1);
});

test('addNote y listNotes funcionan', () => {
  clean();
  const c = legalCaseService.create(TENANT, { title: 'Contrato', summary: 'Revisión', type: 'contract' });
  const n = legalCaseService.addNote(TENANT, c.case.id, { author_id: 'u1', author_name: 'Abogado', body: 'Nota interna', is_internal: true });
  assert.equal(n.success, true);
  const list = legalCaseService.listNotes(TENANT, c.case.id);
  assert.equal(list.notes.length, 1);
});

test('list filtra por tipo y prioridad', () => {
  clean();
  legalCaseService.create(TENANT, { title: 'A', summary: 'x', type: 'contract', priority: 'medium' });
  legalCaseService.create(TENANT, { title: 'B', summary: 'x', type: 'litigation', priority: 'critical' });
  const contracts = legalCaseService.list(TENANT, { type: 'contract' });
  assert.equal(contracts.cases.length, 1);
  assert.equal(contracts.cases[0].type, 'contract');
});
