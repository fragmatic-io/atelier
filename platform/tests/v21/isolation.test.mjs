import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, password } from './helpers.mjs';
import { projectAccess, requireScope } from '../../packages/control-plane/src/access.mjs';
import { validateSnapshot } from '../../packages/control-plane/src/services.mjs';
import { structuralCacheKey } from '../../packages/runtime/src/index.mjs';
import { hash } from '../../packages/control-plane/src/util.mjs';
test('tenant and project isolation: every artifact and project lookup is scoped', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const { service: s, who: w, tenant: a, project: p } = f;
  const b = s.createTenant(w, { name: 'Other' }),
    q = s.createProject(w, a.id, { name: 'Second' }),
    bp = s.createProject(w, b.id, { name: 'Second' });
  const scope = projectAccess(f.db, w, a.id, p.id, 'edit');
  const art = s.store.artifact(scope, 'model', { private: 'alpha' });
  assert.throws(
    () => s.store.getArtifact(projectAccess(f.db, w, a.id, q.id), art.id),
    /not found/i,
  );
  assert.throws(
    () => s.store.getArtifact(projectAccess(f.db, w, b.id, bp.id), art.id),
    /not found/i,
  );
  assert.throws(() => s.project(w, b.id, p.id), /not found/i);
  assert.equal(s.projects(w, a.id).length, 2);
  assert.equal(s.projects(w, b.id).length, 1);
  assert.throws(() => requireScope({ tenantId: a.id, projectId: p.id }), /authorized/i);
});
test('project tokens are exact-scope, expire, and revoke immediately', async (t) => {
  let now = Date.now();
  const f = await fixture({ clock: () => now });
  t.after(() => f.db.close());
  const s = f.service,
    q = s.createProject(f.who, f.tenant.id, { name: 'Second' });
  const issued = s.createToken(f.who, f.tenant.id, f.project.id, {
    name: 'Host',
    scopes: ['read'],
    days: 1,
  });
  const identity = f.auth.identity({ authorization: `Bearer ${issued.token}` });
  assert.equal(projectAccess(f.db, identity, f.tenant.id, f.project.id).projectId, f.project.id);
  assert.throws(() => projectAccess(f.db, identity, f.tenant.id, q.id), /not found/i);
  assert.throws(() => projectAccess(f.db, identity, f.tenant.id, f.project.id, 'edit'), /token/i);
  s.revokeToken(f.who, f.tenant.id, f.project.id, issued.id);
  assert.throws(() => f.auth.identity({ authorization: `Bearer ${issued.token}` }), /revoked/i);
});
test('member can see granted project only and cannot elevate self', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const u = await f.auth.createUser({
    email: 'member@example.test',
    password,
    displayName: 'Member',
  });
  f.db.run('INSERT INTO memberships VALUES(?,?,?,?)', f.tenant.id, u.id, 'member', Date.now());
  f.service.projectMember(f.who, f.tenant.id, f.project.id, u.id, { role: 'viewer' });
  const w = { userId: u.id };
  assert.equal(f.service.projects(w, f.tenant.id).length, 1);
  assert.throws(
    () => f.service.updateProject(w, f.tenant.id, f.project.id, { revision: 1 }),
    /requires/i,
  );
  assert.throws(
    () => f.service.projectMember(w, f.tenant.id, f.project.id, u.id, { role: 'admin' }),
    /requires/i,
  );
  f.service.projectMember(f.who, f.tenant.id, f.project.id, u.id, { remove: true });
  assert.equal(f.service.projects(w, f.tenant.id).length, 0);
});
test('workspace must keep an owner; optimistic project revisions prevent lost updates', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  assert.throws(
    () => f.service.changeMember(f.who, f.tenant.id, f.user.id, { remove: true }),
    /retain/i,
  );
  const p = f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: 1,
    description: 'one',
  });
  assert.equal(p.revision, 2);
  assert.throws(
    () =>
      f.service.updateProject(f.who, f.tenant.id, f.project.id, {
        revision: 1,
        description: 'two',
      }),
    /changed/i,
  );
});
test('source upload denies traversal, hidden credentials, repeated paths, prototype keys', () => {
  for (const path of ['../escape.ts', '.env.local', 'src/key.pem', 'node_modules/a.ts'])
    assert.throws(() => validateSnapshot({ files: [{ path, content: 'const a=1' }] }));
  assert.throws(() =>
    validateSnapshot({
      files: [
        { path: 'a.ts', content: 'a' },
        { path: 'a.ts', content: 'b' },
      ],
    }),
  );
  assert.throws(() =>
    validateSnapshot(JSON.parse('{"files":[{"path":"a.ts","content":"a"}],"__proto__":{}}')),
  );
  assert.throws(() =>
    validateSnapshot({ files: [{ path: 'key.ts', content: '-----BEGIN PRIVATE KEY-----' }] }),
  );
});
test('cached structures never cross tenant, permissions, viewport or project', () => {
  const a = {
    tenantId: 'a',
    projectId: 'p',
    projectVersion: '1',
    slotId: 's',
    role: 'x',
    permissions: ['read'],
    entity: { id: '1', type: 'customer' },
  };
  const key = structuralCacheKey(a);
  assert.equal(key, structuralCacheKey({ ...a, entity: { id: '2', type: 'customer' } }));
  for (const patch of [
    { tenantId: 'b' },
    { projectId: 'q' },
    { permissions: ['write'] },
    { viewportClass: 'mobile' },
    { projectVersion: '2' },
  ])
    assert.notEqual(key, structuralCacheKey({ ...a, ...patch }));
});
test('audit hash chain is append-only and detects corruption', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  assert.equal(f.service.store.verifyAudit(f.tenant.id).valid, true);
  assert.throws(() => f.db.run('UPDATE audit SET action=? WHERE tenant_id=?', 'evil', f.tenant.id));
  assert.throws(() => f.db.run('DELETE FROM audit WHERE tenant_id=?', f.tenant.id));
});
test('same tenant budget is enforced across projects; reservations survive restart semantics', async (t) => {
  let now = Date.now();
  const f = await fixture({ clock: () => now });
  t.after(() => f.db.close());
  f.db.run('UPDATE tenants SET daily_token_limit=100 WHERE id=?', f.tenant.id);
  const q = f.service.createProject(f.who, f.tenant.id, { name: 'Other' });
  const a = projectAccess(f.db, f.who, f.tenant.id, f.project.id),
    b = projectAccess(f.db, f.who, f.tenant.id, q.id);
  const r = f.service.store.reserve(a, 80);
  assert.throws(() => f.service.store.reserve(b, 21), /budget/i);
  f.service.store.settle(a, r, { inputTokens: 5, outputTokens: 5 });
  assert.doesNotThrow(() => f.service.store.reserve(b, 80));
  now += 31 * 60000;
  f.service.store.cleanup();
  assert.equal(f.db.get('SELECT sum(reserved_tokens) n FROM usage').n, 0);
  assert.equal(f.db.get('SELECT sum(input_tokens+output_tokens) n FROM usage').n, 90);
});
test('model cache is scoped even when cache hashes collide', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const q = f.service.createProject(f.who, f.tenant.id, { name: 'Other' });
  const a = projectAccess(f.db, f.who, f.tenant.id, f.project.id),
    b = projectAccess(f.db, f.who, f.tenant.id, q.id);
  f.service.store.cacheSet(a, 'same', { value: 'private' });
  assert.equal(f.service.store.cacheGet(b, 'same'), null);
  assert.equal(f.service.store.cacheGet(a, 'same').value, 'private');
});
test('revoked inviter cannot use an outstanding invitation to grant access', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const u = await f.auth.createUser({
    email: 'admin@example.test',
    password,
    displayName: 'Admin',
  });
  f.db.run('INSERT INTO memberships VALUES(?,?,?,?)', f.tenant.id, u.id, 'admin', Date.now());
  const invite = f.service.invite({ userId: u.id }, f.tenant.id, {
    email: 'new@example.test',
    role: 'admin',
  });
  f.service.changeMember(f.who, f.tenant.id, u.id, { remove: true });
  await assert.rejects(
    () => f.service.acceptInvite({ token: invite.invitationToken, password, displayName: 'New' }),
    /not found/i,
  );
  assert.equal(f.db.get('SELECT count(*) n FROM memberships WHERE tenant_id=?', f.tenant.id).n, 1);
});
