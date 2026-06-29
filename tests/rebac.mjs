import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import authorizationService from '../src/services/authorizationService.js';

const TENANT = 'tenant-rebac-test';

describe('authorizationService', () => {
  it('write tuple y check direct allow', () => {
    authorizationService.write(TENANT, { object_type: 'document', object_id: 'doc-1', relation: 'viewer', user_type: 'user', user_id: 'u-1' });
    const c = authorizationService.check(TENANT, { object_type: 'document', object_id: 'doc-1', relation: 'viewer', user_type: 'user', user_id: 'u-1' });
    assert.equal(c.allowed, true);
    assert.equal(c.reason, 'direct');
    assert.ok(c.zookie);
  });

  it('check sin relación deniega', () => {
    const c = authorizationService.check(TENANT, { object_type: 'document', object_id: 'doc-2', relation: 'editor', user_type: 'user', user_id: 'u-2' });
    assert.equal(c.allowed, false);
  });

  it('owner implica viewer y editor', () => {
    authorizationService.write(TENANT, { object_type: 'document', object_id: 'doc-3', relation: 'owner', user_type: 'user', user_id: 'u-3' });
    const v = authorizationService.check(TENANT, { object_type: 'document', object_id: 'doc-3', relation: 'viewer', user_type: 'user', user_id: 'u-3' });
    assert.equal(v.allowed, true);
    assert.equal(v.reason, 'owner-implies-viewer');
    const e = authorizationService.check(TENANT, { object_type: 'document', object_id: 'doc-3', relation: 'editor', user_type: 'user', user_id: 'u-3' });
    assert.equal(e.allowed, true);
  });

  it('userset: viewer a grupo, miembro hereda', () => {
    authorizationService.write(TENANT, { object_type: 'document', object_id: 'doc-4', relation: 'viewer', user_type: 'group', user_id: 'eng' });
    authorizationService.write(TENANT, { object_type: 'group', object_id: 'eng', relation: 'member', user_type: 'user', user_id: 'u-4' });
    const c = authorizationService.check(TENANT, { object_type: 'document', object_id: 'doc-4', relation: 'viewer', user_type: 'user', user_id: 'u-4' });
    assert.equal(c.allowed, true);
    assert.ok(c.reason.startsWith('userset'));
  });

  it('delete tuple remueve acceso', () => {
    authorizationService.write(TENANT, { object_type: 'document', object_id: 'doc-5', relation: 'viewer', user_type: 'user', user_id: 'u-5' });
    authorizationService.deleteTuple(TENANT, { object_type: 'document', object_id: 'doc-5', relation: 'viewer', user_type: 'user', user_id: 'u-5' });
    const c = authorizationService.check(TENANT, { object_type: 'document', object_id: 'doc-5', relation: 'viewer', user_type: 'user', user_id: 'u-5' });
    assert.equal(c.allowed, false);
  });

  it('list filtra por object_type', () => {
    authorizationService.write(TENANT, { object_type: 'ticket', object_id: 'TK-99', relation: 'owner', user_type: 'user', user_id: 'u-6' });
    const list = authorizationService.list(TENANT, { object_type: 'ticket' });
    assert.ok(list.some(t => t.object_id === 'TK-99'));
  });

  it('expand devuelve tuples de una relación', () => {
    authorizationService.write(TENANT, { object_type: 'document', object_id: 'doc-6', relation: 'viewer', user_type: 'user', user_id: 'u-7' });
    authorizationService.write(TENANT, { object_type: 'document', object_id: 'doc-6', relation: 'viewer', user_type: 'user', user_id: 'u-8' });
    const exp = authorizationService.expand(TENANT, { object_type: 'document', object_id: 'doc-6', relation: 'viewer' });
    assert.equal(exp.length >= 2, true);
  });

  it('snapshot genera zookie', () => {
    const s = authorizationService.snapshot(TENANT, 'document', 'doc-7');
    assert.ok(s.zookie);
    assert.equal(s.object_type, 'document');
  });
});
