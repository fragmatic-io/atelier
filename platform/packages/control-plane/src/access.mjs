// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, parseJson } from './util.mjs';
const RIGHTS = {
  viewer: new Set(['read']),
  reviewer: new Set(['read', 'review']),
  editor: new Set(['read', 'edit', 'run']),
  admin: new Set(['read', 'edit', 'run', 'review', 'publish', 'manage']),
  owner: new Set(['read', 'edit', 'run', 'review', 'publish', 'manage']),
};
const branded = new WeakSet();
function scope(value) {
  const s = Object.freeze(value);
  branded.add(s);
  return s;
}
export function requireScope(value) {
  assert(branded.has(value), 500, 'SCOPE_REQUIRED', 'An authorized project scope is required');
  return value;
}
export function tenantAccess(db, identity, tenantId, need = 'read') {
  assert(identity?.userId, 401, 'UNAUTHENTICATED', 'Sign in to continue');
  if (identity.token)
    assert(identity.token.tenant_id === tenantId, 404, 'NOT_FOUND', 'Workspace not found');
  const t = db.get('SELECT * FROM tenants WHERE id=? AND deleted_at IS NULL', tenantId);
  const m = db.get(
    'SELECT m.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.user_id=? AND u.disabled_at IS NULL',
    tenantId,
    identity.userId,
  );
  assert(t && m, 404, 'NOT_FOUND', 'Workspace not found');
  if (need === 'manage')
    assert(
      ['owner', 'admin'].includes(m.role) && !identity.token,
      403,
      'FORBIDDEN',
      'Workspace administrator access is required',
    );
  return { ...t, membership: m };
}
export function projectAccess(db, identity, tenantId, projectId, need = 'read') {
  const t = tenantAccess(db, identity, tenantId);
  const p = db.get(
    'SELECT * FROM projects WHERE tenant_id=? AND id=? AND archived_at IS NULL',
    tenantId,
    projectId,
  );
  assert(p, 404, 'NOT_FOUND', 'Project not found');
  let role = t.membership.role;
  if (!['owner', 'admin'].includes(role)) {
    const pm = db.get(
      'SELECT role FROM project_members WHERE tenant_id=? AND project_id=? AND user_id=?',
      tenantId,
      projectId,
      identity.userId,
    );
    assert(pm, 404, 'NOT_FOUND', 'Project not found');
    role = pm.role;
    if (t.membership.role === 'viewer') role = 'viewer';
  }
  assert(RIGHTS[role]?.has(need), 403, 'FORBIDDEN', `This operation requires ${need} access`);
  if (identity.token) {
    assert(identity.token.project_id === projectId, 404, 'NOT_FOUND', 'Project not found');
    const scopes = parseJson(identity.token.scopes_json, []);
    assert(scopes.includes(need), 403, 'TOKEN_SCOPE', 'This token does not permit the operation');
  }
  return scope({
    tenantId,
    projectId,
    userId: identity.userId,
    role,
    project: p,
    tenant: t,
    token: identity.token ?? null,
  });
}
/** Internal worker entry. Never construct this scope from request-supplied identity. */
export function workerScope(db, tenantId, projectId, userId) {
  const identity = { userId };
  return projectAccess(db, identity, tenantId, projectId, 'run');
}
/** Internal observer entry. The caller must supply a row selected by credential hash. */
export function observerScope(db, source) {
  assert(
    source?.id && source?.tenant_id && source?.project_id,
    500,
    'OBSERVER_SOURCE',
    'Observer source is required',
  );
  const row = db.get(
    "SELECT s.*,p.* FROM discovery_sources s JOIN projects p ON p.tenant_id=s.tenant_id AND p.id=s.project_id WHERE s.tenant_id=? AND s.project_id=? AND s.id=? AND s.status='active' AND s.revoked_at IS NULL AND p.archived_at IS NULL",
    source.tenant_id,
    source.project_id,
    source.id,
  );
  assert(row, 401, 'OBSERVER_REVOKED', 'Observation source is not active');
  return scope({
    tenantId: source.tenant_id,
    projectId: source.project_id,
    userId: `observer:${source.id}`,
    role: 'observer',
    project: db.get(
      'SELECT * FROM projects WHERE tenant_id=? AND id=? AND archived_at IS NULL',
      source.tenant_id,
      source.project_id,
    ),
    token: null,
  });
}
export function listProjects(db, identity, tenantId) {
  const t = tenantAccess(db, identity, tenantId);
  let rows;
  if (['owner', 'admin'].includes(t.membership.role))
    rows = db.all(
      'SELECT * FROM projects WHERE tenant_id=? AND archived_at IS NULL ORDER BY created_at DESC,id',
      tenantId,
    );
  else
    rows = db.all(
      'SELECT p.* FROM projects p JOIN project_members pm ON pm.tenant_id=p.tenant_id AND pm.project_id=p.id WHERE p.tenant_id=? AND pm.user_id=? AND p.archived_at IS NULL ORDER BY p.created_at DESC,p.id',
      tenantId,
      identity.userId,
    );
  if (identity.token) rows = rows.filter((p) => p.id === identity.token.project_id);
  return rows;
}
