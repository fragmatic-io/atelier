import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { fixture, password } from './helpers.mjs';
import { createControlServer } from '../../packages/control-plane/src/server.mjs';
import { totp } from '../../packages/control-plane/src/crypto.mjs';
async function httpEnv(t) {
  const f = await fixture();
  const control = createControlServer(f.service, { log: () => {} });
  await new Promise((resolve) => control.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await control.close();
    f.db.close();
  });
  const port = control.server.address().port;
  const call = (path, method = 'GET', body, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            Host: '127.0.0.1:4310',
            ...(body
              ? { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4310' }
              : {}),
            ...headers,
          },
        },
        (res) => {
          let text = '';
          res.on('data', (c) => (text += c));
          res.on('end', () => {
            let data;
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
            resolve({ status: res.statusCode, headers: res.headers, data });
          });
        },
      );
      req.on('error', reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
  return { ...f, call };
}
test('live HTTP authentication: secure headers, HttpOnly cookies, CSRF, foreign Origin and private endpoints', async (t) => {
  const f = await httpEnv(t);
  assert.equal((await f.call('/api/me')).status, 401);
  const login = await f.call('/api/auth/login', 'POST', {
    email: 'builder@example.test',
    password,
  });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  const Cookie = login.headers['set-cookie'][0].split(';')[0],
    csrf = login.data.csrf;
  assert.equal((await f.call('/api/me', 'GET', null, { Cookie })).status, 200);
  assert.equal((await f.call('/api/tenants', 'POST', { name: 'Blocked' }, { Cookie })).status, 403);
  assert.equal(
    (
      await f.call(
        '/api/tenants',
        'POST',
        { name: 'Blocked' },
        { Cookie, 'X-CSRF-Token': csrf, Origin: 'https://attacker.example' },
      )
    ).status,
    403,
  );
  const created = await f.call(
    '/api/tenants',
    'POST',
    { name: 'Valid' },
    { Cookie, 'X-CSRF-Token': csrf },
  );
  assert.equal(created.status, 201);
  assert.match(created.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal((await f.call('/healthz', 'GET', null, { Host: 'evil.example' })).status, 400);
  assert.equal(
    (await f.call('/api/auth/logout', 'POST', {}, { Cookie, 'X-CSRF-Token': csrf })).status,
    200,
  );
  assert.equal((await f.call('/api/me', 'GET', null, { Cookie })).status, 401);
});
test('MFA setup, replay prevention, concurrent replay and single-use recovery', async (t) => {
  let now = Date.now();
  const f = await fixture({ clock: () => now });
  t.after(() => f.db.close());
  const login = await f.auth.login({ email: 'builder@example.test', password });
  const identity = f.auth.identity({ cookie: `atelier_session=${login.session}` });
  const setup = await f.auth.setupMfa(identity, { password });
  const firstCode = totp(setup.secret, Math.floor(now / 30000));
  const enabled = f.auth.confirmMfa(identity, { code: firstCode });
  await assert.rejects(
    () => f.auth.login({ email: 'builder@example.test', password, code: firstCode }),
    /incorrect/,
  );
  now += 30000;
  const next = totp(setup.secret, Math.floor(now / 30000));
  const results = await Promise.allSettled([
    f.auth.login({ email: 'builder@example.test', password, code: next }),
    f.auth.login({ email: 'builder@example.test', password, code: next }),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  await f.auth.login({ email: 'builder@example.test', password, code: enabled.recoveryCodes[0] });
  await assert.rejects(
    () => f.auth.login({ email: 'builder@example.test', password, code: enabled.recoveryCodes[0] }),
    /incorrect/,
  );
});
test('session idle/absolute expiry and password changes revoke every session', async (t) => {
  let now = Date.now();
  const f = await fixture({ clock: () => now });
  t.after(() => f.db.close());
  const login = await f.auth.login({ email: 'builder@example.test', password });
  const identity = f.auth.identity({ cookie: `atelier_session=${login.session}` });
  await f.auth.changePassword(identity, {
    currentPassword: password,
    newPassword: 'a completely different durable phrase',
  });
  assert.throws(() => f.auth.identity({ cookie: `atelier_session=${login.session}` }), /expired/);
  const fresh = await f.auth.login({
    email: 'builder@example.test',
    password: 'a completely different durable phrase',
  });
  now += 31 * 60000;
  assert.throws(() => f.auth.identity({ cookie: `atelier_session=${fresh.session}` }), /expired/);
});
