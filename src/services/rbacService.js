import db from './db.js';
import { now, randomId } from './_utils.js';

const DEFAULT_ROLES = {
  superadmin: { permissions: ['*:*'] },
  admin: {
    permissions: [
      'tenant:*', 'users:*', 'billing:*', 'workflows:*', 'assets:*',
      'providers:*', 'apikeys:*', 'webhooks:*', 'analytics:*', 'prompts:*',
      'tickets:*', 'kb:*', 'legal:*', 'marketing:*', 'contracts:*'
    ]
  },
  analyst: {
    permissions: [
      'analytics:read', 'reports:read', 'tickets:read', 'kb:read', 'workflows:read'
    ]
  },
  agent: {
    permissions: [
      'tickets:*', 'chat:*', 'kb:read', 'documents:*', 'legal:read', 'contracts:read'
    ]
  },
  viewer: {
    permissions: ['tickets:read', 'kb:read', 'analytics:read']
  }
};

function initRoles() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM rbac_permissions').get().count;
  if (existing > 0) return;
  for (const [role, def] of Object.entries(DEFAULT_ROLES)) {
    for (const perm of def.permissions) {
      const [resource, action] = perm.split(':');
      db.prepare('INSERT INTO rbac_permissions (id, role_name, permission, resource, action, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomId('perm'), role, perm, resource, action, now());
    }
  }
}

export function can(user, resource, action) {
  if (!user || !user.role) return false;
  if (user.role === 'superadmin') return true;
  const perms = db.prepare('SELECT permission, resource, action FROM rbac_permissions WHERE role_name = ?').all(user.role);
  return perms.some(p => {
    const resMatch = p.resource === '*' || p.resource === resource;
    const actMatch = p.action === '*' || p.action === action;
    return resMatch && actMatch;
  });
}

export function require(user, resource, action) {
  if (!can(user, resource, action)) {
    throw new Error(`Permiso denegado: ${resource}:${action}`);
  }
}

export function listPermissions(role) {
  return db.prepare('SELECT * FROM rbac_permissions WHERE role_name = ?').all(role);
}

export function grantPermission(role, resource, action) {
  const perm = `${resource}:${action}`;
  const existing = db.prepare('SELECT id FROM rbac_permissions WHERE role_name = ? AND permission = ?').get(role, perm);
  if (existing) return { id: existing.id };
  const id = randomId('perm');
  db.prepare('INSERT INTO rbac_permissions (id, role_name, permission, resource, action, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, role, perm, resource, action, now());
  return { id, role, resource, action };
}

export function revokePermission(role, resource, action) {
  return db.prepare('DELETE FROM rbac_permissions WHERE role_name = ? AND resource = ? AND action = ?').run(role, resource, action).changes > 0;
}

export function listRoles() {
  return db.prepare('SELECT DISTINCT role_name FROM rbac_permissions ORDER BY role_name').all().map(r => r.role_name);
}

initRoles();

export default { can, require, listPermissions, grantPermission, revokePermission, listRoles };