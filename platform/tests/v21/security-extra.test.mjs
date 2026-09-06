import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, password, scanned, generated, runJob, sample } from './helpers.mjs';
import { clientAddress } from '../../packages/control-plane/src/server.mjs';
import { SqliteActionLedger } from '../../packages/host-sdk/src/index.mjs';
import { createSnapshot } from '../../scripts/snapshot.mjs';
test('concurrent password change cannot revive a revoked session or overwrite the winner', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const login = await f.auth.login({ email: 'builder@example.test', password });
  const identity = f.auth.identity({ cookie: `atelier_session=${login.session}` });
  const issued = f.service.createToken(f.who, f.tenant.id, f.project.id, {
    name: 'Previous token',
  });
  const results = await Promise.allSettled(
    ['new long password one', 'new long password two'].map((newPassword) =>
      f.auth.changePassword(identity, { currentPassword: password, newPassword }),
    ),
  );
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.throws(() => f.auth.identity({ authorization: `Bearer ${issued.token}` }), /revoked/);
  await assert.rejects(() => f.auth.setupMfa(identity, { password }), /expired/);
});
test('password resource budget also covers account creation and MFA, not only login', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  f.auth.inflight = f.auth.maxPasswordChecks;
  await assert.rejects(
    () => f.auth.createUser({ email: 'blocked@example.test', displayName: 'Blocked', password }),
    /concurrent/,
  );
  assert.equal(f.db.get('SELECT count(*) n FROM users').n, 1);
});
test('proxy rate-limit identity trusts only one explicitly enabled sanitizing loopback proxy', () => {
  const req = (peer, header) => ({
    socket: { remoteAddress: peer },
    headers: { 'x-real-ip': header },
  });
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.7')), '127.0.0.1');
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.7'), true), '203.0.113.7');
  assert.equal(clientAddress(req('192.0.2.5', '203.0.113.7'), true), '192.0.2.5');
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.7,8.8.8.8'), true), '127.0.0.1');
});
test('concurrent duplicate business action cannot execute while the original is pending', async (t) => {
  const ledger = new SqliteActionLedger(':memory:');
  t.after(() => ledger.close());
  let done,
    count = 0;
  const wait = new Promise((resolve) => (done = resolve));
  const first = ledger.run('scope', 'abcdefghijklmnop', 'payload', async () => {
    count++;
    await wait;
    return { committed: true };
  });
  await assert.rejects(
    () =>
      ledger.run('scope', 'abcdefghijklmnop', 'payload', async () => {
        count++;
      }),
    /uncertain/,
  );
  done();
  assert.equal((await first).replayed, false);
  assert.equal(count, 1);
  assert.equal(
    (await ledger.run('scope', 'abcdefghijklmnop', 'payload', () => assert.fail())).replayed,
    true,
  );
});
test('production promotion requires a different authorized reviewer; revocation invalidates approval', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const output = await generated(f, { variants: 1 });
  const staging = output.releaseIds[0];
  f.service.approve(f.who, f.tenant.id, f.project.id, staging, {
    approved: true,
    previewReviewed: true,
  });
  f.service.publish(f.who, f.tenant.id, f.project.id, staging, { revision: 0 });
  let p = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, p.id, {
    revision: p.revision,
    settings: { separationOfDuties: true },
  });
  const prod = f.service.promote(f.who, f.tenant.id, p.id, staging);
  assert.throws(
    () =>
      f.service.approve(f.who, f.tenant.id, p.id, prod.id, {
        approved: true,
        previewReviewed: true,
      }),
    /different reviewer/,
  );
  const other = await f.auth.createUser({
    email: 'reviewer@example.test',
    displayName: 'Reviewer',
    password,
  });
  f.db.run('INSERT INTO memberships VALUES(?,?,?,?)', f.tenant.id, other.id, 'member', Date.now());
  f.service.projectMember(f.who, f.tenant.id, p.id, other.id, { role: 'reviewer' });
  f.service.approve({ userId: other.id }, f.tenant.id, p.id, prod.id, {
    approved: true,
    previewReviewed: true,
  });
  f.service.projectMember(f.who, f.tenant.id, p.id, other.id, { remove: true });
  assert.throws(() => f.service.publish(f.who, f.tenant.id, p.id, prod.id, { revision: 0 }));
});
test('an endpoint or schema change invalidates previously reviewed command semantics', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const c = f.service
    .model(f.who, f.tenant.id, f.project.id)
    .capabilities.find((x) => x.id === 'customer.archive');
  f.service.reviewCapability(f.who, f.tenant.id, f.project.id, c.id, {
    risk: 'destructive',
    confirmation: 'modal',
    reversible: false,
    requiredPermissions: c.requiredPermissions,
  });
  const snapshot = await createSnapshot(sample);
  const file = snapshot.files.find((x) => x.path === 'openapi.json'),
    spec = JSON.parse(file.content);
  const old = '/api/customers/{customerId}/archive';
  spec.paths['/api/customers/{customerId}/purge'] = spec.paths[old];
  delete spec.paths[old];
  file.content = JSON.stringify(spec);
  f.service.upload(f.who, f.tenant.id, f.project.id, snapshot);
  await runJob(f);
  assert.notEqual(
    f.service.model(f.who, f.tenant.id, f.project.id).capabilities.find((x) => x.id === c.id)
      .securityReviewed,
    true,
  );
});
