import test from 'node:test';
import assert from 'node:assert/strict';
import abac from '../src/services/abacService.js';

test('deny action when role does not match', () => {
  const tenant = 't-abac-' + Date.now();
  abac.addPolicy({ tenant_id: tenant, name: 'admins only', resource: 'billing', action: 'read', conditions: { 'subject.role': 'admin' }, effect: 'allow', priority: 10 });
  abac.addPolicy({ tenant_id: tenant, name: 'deny agents', resource: 'billing', action: 'read', conditions: { 'subject.role': 'agent' }, effect: 'deny', priority: 20 });
  const r = abac.evaluate({ tenant_id: tenant, subject: { role: 'agent' }, resource: 'billing', action: 'read' });
  assert.equal(r.allowed, false);
});

test('allow matching condition', () => {
  const tenant = 't-abac2-' + Date.now();
  abac.addPolicy({ tenant_id: tenant, name: 'admin allow', resource: 'agents', action: 'invoke', conditions: { 'subject.role': 'admin' }, effect: 'allow', priority: 10 });
  const r = abac.evaluate({ tenant_id: tenant, subject: { role: 'admin' }, resource: 'agents', action: 'invoke' });
  assert.equal(r.allowed, true);
});
