// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadConfig, openServices } from '../packages/control-plane/src/config.mjs';
const config = await loadConfig();
const { db, auth, service, box } = openServices(config);
const [cmd, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(
  rest.map((x) => {
    const i = x.indexOf('=');
    return [x.slice(0, i).replace(/^--/, ''), x.slice(i + 1)];
  }),
);
try {
  if (cmd === 'bootstrap') {
    if (db.get('SELECT id FROM users LIMIT 1'))
      throw new Error(
        'Bootstrap is only available for an empty database. Use an invitation for new accounts.',
      );
    if (!args.email) throw new Error('Provide --email=you@example.com');
    const password =
      process.env.ATELIER_BOOTSTRAP_PASSWORD ?? randomBytes(24).toString('base64url');
    const user = await auth.createUser({
      email: args.email,
      password,
      displayName: args.name ?? 'Administrator',
    });
    const t = service.createTenant({ userId: user.id }, { name: args.tenant ?? 'My workspace' });
    console.log(
      JSON.stringify(
        {
          email: user.email,
          password,
          tenantId: t.id,
          note: 'Save this generated password now; it is not recoverable.',
        },
        null,
        2,
      ),
    );
  } else if (cmd === 'backup') {
    if (!args.out) throw new Error('Provide --out=/secure/backup.sqlite');
    const path = resolve(args.out);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await db.backup(path);
    console.log(
      JSON.stringify({
        backup: path,
        integrity: db.integrity(),
        note: 'Master keys are deliberately not included. Back them up separately.',
      }),
    );
  } else if (cmd === 'verify') {
    const tenants = db.all('SELECT id FROM tenants');
    const audits = tenants.map((t) => ({ tenantId: t.id, ...service.store.verifyAudit(t.id) }));
    const integrity = db.integrity();
    console.log(JSON.stringify({ integrity, audits }, null, 2));
    if (!integrity || audits.some((x) => !x.valid)) process.exitCode = 1;
  } else if (cmd === 'rewrap-keys') {
    db.transaction(() => {
      for (const c of db.all('SELECT * FROM connections WHERE secret_cipher IS NOT NULL'))
        db.run(
          'UPDATE connections SET secret_cipher=? WHERE tenant_id=? AND id=?',
          box.rewrap(c.secret_cipher, `tenant:${c.tenant_id}:connection:${c.id}`),
          c.tenant_id,
          c.id,
        );
      for (const k of db.all('SELECT * FROM signing_keys'))
        db.run(
          'UPDATE signing_keys SET private_cipher=? WHERE tenant_id=? AND project_id=? AND id=?',
          box.rewrap(
            k.private_cipher,
            `tenant:${k.tenant_id}:project:${k.project_id}:signing:${k.id}`,
          ),
          k.tenant_id,
          k.project_id,
          k.id,
        );
      for (const u of db.all('SELECT * FROM users')) {
        if (u.mfa_secret)
          db.run(
            'UPDATE users SET mfa_secret=? WHERE id=?',
            box.rewrap(u.mfa_secret, `user:${u.id}:totp`),
            u.id,
          );
        if (u.mfa_pending)
          db.run(
            'UPDATE users SET mfa_pending=? WHERE id=?',
            box.rewrap(u.mfa_pending, `user:${u.id}:pending-totp`),
            u.id,
          );
      }
    });
    console.log(
      'Encrypted secrets rewrapped to the active key. Keep prior keys until backups have expired.',
    );
  } else if (cmd === 'reset-password') {
    if (!args.email) throw new Error('Provide --email=account@example.com');
    const u = db.get('SELECT * FROM users WHERE email=?', args.email);
    if (!u) throw new Error('Account not found');
    const { passwordHash } = await import('../packages/control-plane/src/crypto.mjs');
    const password = randomBytes(24).toString('base64url');
    const encoded = await passwordHash(password);
    db.transaction(() => {
      db.run('UPDATE users SET password_hash=? WHERE id=?', encoded, u.id);
      db.run('DELETE FROM sessions WHERE user_id=?', u.id);
      db.run('UPDATE api_tokens SET revoked_at=? WHERE user_id=?', Date.now(), u.id);
      for (const m of db.all('SELECT tenant_id FROM memberships WHERE user_id=?', u.id))
        service.store.audit(
          { tenantId: m.tenant_id, userId: 'operator' },
          'account.password_reset',
          u.id,
        );
    });
    console.log(
      JSON.stringify({
        email: u.email,
        password,
        note: 'MFA remains enabled. Operator recovery does not silently remove MFA.',
      }),
    );
  } else
    console.log(
      'Commands: bootstrap --email= --name= --tenant= | backup --out= | verify | rewrap-keys | reset-password --email=',
    );
} finally {
  db.close();
}
