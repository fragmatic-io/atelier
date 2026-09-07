// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import {
  passwordHash,
  passwordMatches,
  newApiToken,
  newTotpSecret,
  verifyTotp,
  recoveryCodes,
} from './crypto.mjs';
import {
  AppError,
  assert,
  choice,
  email,
  hash,
  id,
  same,
  text,
  token,
  parseJson,
} from './util.mjs';
export class AuthService {
  constructor(
    db,
    box,
    {
      clock = () => Date.now(),
      sessionTtl = 12 * 3600000,
      idleTtl = 30 * 60000,
      maxPasswordChecks = 4,
    } = {},
  ) {
    this.db = db;
    this.box = box;
    this.clock = clock;
    this.sessionTtl = sessionTtl;
    this.idleTtl = idleTtl;
    this.inflight = 0;
    this.maxPasswordChecks = maxPasswordChecks;
  }
  async passwordWork(work) {
    assert(
      this.inflight < this.maxPasswordChecks,
      429,
      'AUTH_BUSY',
      'Too many concurrent password operations',
    );
    this.inflight++;
    try {
      return await work();
    } finally {
      this.inflight--;
    }
  }
  /** Revalidate after every asynchronous password operation; another request may revoke the session. */
  currentSession(identity, expectedHash) {
    assert(
      !identity.token && identity.session,
      403,
      'SESSION_REQUIRED',
      'A signed-in browser session is required',
    );
    const session = this.db.get(
      'SELECT * FROM sessions WHERE hash=? AND user_id=?',
      identity.session.hash,
      identity.userId,
    );
    const now = this.clock();
    assert(
      session && session.expires_at > now && session.last_seen + this.idleTtl > now,
      401,
      'SESSION_EXPIRED',
      'Session expired. Sign in again',
    );
    const user = this.db.get(
      'SELECT * FROM users WHERE id=? AND disabled_at IS NULL',
      identity.userId,
    );
    assert(
      user && (!expectedHash || user.password_hash === expectedHash),
      401,
      'CREDENTIALS_CHANGED',
      'Credentials changed; sign in again',
    );
    return user;
  }
  async createUser({ email: mail, password, displayName }) {
    const e = email(mail);
    const name = text(displayName, 'Name', { max: 100 });
    const encoded = await this.passwordWork(() => passwordHash(password));
    const userId = id('usr');
    try {
      this.db.run(
        'INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES(?,?,?,?,?)',
        userId,
        e,
        name,
        encoded,
        this.clock(),
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE'))
        throw new AppError(409, 'ACCOUNT_EXISTS', 'This account already exists');
      throw err;
    }
    return { id: userId, email: e, displayName: name };
  }
  async register({ email: mail, password, displayName }, ip = 'local') {
    const e = email(mail);
    this.rate(`signup-ip:${ip}`, { limit: 10, windowMs: 15 * 60000 });
    this.rate(`signup-email:${e}`, { limit: 3, windowMs: 15 * 60000 });
    const created = await this.createUser({ email: e, password, displayName });
    const user = this.db.get('SELECT * FROM users WHERE id=? AND disabled_at IS NULL', created.id);
    assert(user, 500, 'ACCOUNT_CREATE_FAILED', 'The account could not be opened');
    return this.createSession(user);
  }
  createSession(user) {
    const raw = token();
    const csrf = token();
    const now = this.clock();
    this.db.run(
      'INSERT INTO sessions VALUES(?,?,?,?,?,?)',
      hash(raw),
      user.id,
      csrf,
      now,
      now + this.sessionTtl,
      now,
    );
    return {
      session: raw,
      csrf,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        mfaEnabled: !!user.mfa_secret,
      },
      expiresAt: now + this.sessionTtl,
    };
  }
  rate(bucket, { limit = 10, windowMs = 60000 } = {}) {
    const now = this.clock();
    return this.db.transaction(() => {
      const row = this.db.get('SELECT * FROM rate_limits WHERE bucket=?', hash(bucket));
      if (!row || row.reset_at <= now) {
        this.db.run(
          'INSERT INTO rate_limits VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at',
          hash(bucket),
          1,
          now + windowMs,
        );
        return;
      }
      assert(row.count < limit, 429, 'RATE_LIMITED', 'Too many attempts. Try again later', {
        retryAfter: Math.ceil((row.reset_at - now) / 1000),
      });
      this.db.run('UPDATE rate_limits SET count=count+1 WHERE bucket=?', hash(bucket));
    });
  }
  async login({ email: mail, password, code }, ip = 'local') {
    const e = email(mail);
    this.rate(`login-ip:${ip}`, { limit: 30, windowMs: 15 * 60000 });
    this.rate(`login-user:${e}`, { limit: 10, windowMs: 15 * 60000 });
    const userBeforeCheck = this.db.get(
      'SELECT * FROM users WHERE email=? AND disabled_at IS NULL',
      e,
    );
    // Do the same expensive work even for absent users. The limit is shared with
    // invitation, password-change and MFA endpoints to bound process memory use.
    const encoded =
      userBeforeCheck?.password_hash ??
      `scrypt$65536$8$1$00000000000000000000000000000000$${'0'.repeat(128)}`;
    const valid = await this.passwordWork(() => passwordMatches(password, encoded));
    let user = userBeforeCheck;
    assert(
      user && valid,
      401,
      'INVALID_CREDENTIALS',
      'Email, password or verification code is incorrect',
    );
    return this.db.transaction(() => {
      const latest = this.db.get('SELECT * FROM users WHERE id=? AND disabled_at IS NULL', user.id);
      assert(
        latest && latest.password_hash === user.password_hash,
        401,
        'INVALID_CREDENTIALS',
        'Credentials changed; sign in again',
      );
      user = latest;
      if (user.mfa_secret) {
        const counter = verifyTotp(
          this.box.open(user.mfa_secret, `user:${user.id}:totp`),
          String(code ?? ''),
          { now: this.clock(), lastCounter: user.mfa_counter },
        );
        const codes = parseJson(user.recovery_json, []);
        const index = codes.indexOf(hash(String(code ?? '')));
        assert(
          counter !== null || index >= 0,
          401,
          'INVALID_CREDENTIALS',
          'Email, password or verification code is incorrect',
        );
        if (counter !== null)
          assert(
            this.db.run(
              'UPDATE users SET mfa_counter=? WHERE id=? AND mfa_counter<?',
              counter,
              user.id,
              counter,
            ).changes === 1,
            401,
            'INVALID_CREDENTIALS',
            'Verification code was already used',
          );
        else {
          codes.splice(index, 1);
          this.db.run(
            'UPDATE users SET recovery_json=? WHERE id=?',
            JSON.stringify(codes),
            user.id,
          );
        }
      }
      this.db.run('DELETE FROM rate_limits WHERE bucket=?', hash(`login-user:${e}`));
      return this.createSession(user);
    });
  }
  identity({ authorization, cookie }) {
    const now = this.clock();
    if (authorization) {
      const m = /^Bearer (atk_[A-Za-z0-9_-]{43})$/.exec(authorization);
      assert(m, 401, 'INVALID_TOKEN', 'Invalid bearer token');
      const t = this.db.get(
        'SELECT * FROM api_tokens WHERE hash=? AND revoked_at IS NULL AND expires_at>?',
        hash(m[1]),
        now,
      );
      assert(t, 401, 'INVALID_TOKEN', 'Token expired or revoked');
      const u = this.db.get('SELECT id FROM users WHERE id=? AND disabled_at IS NULL', t.user_id);
      assert(u, 401, 'INVALID_TOKEN', 'Token owner is unavailable');
      this.db.run('UPDATE api_tokens SET last_used=? WHERE hash=?', now, hash(m[1]));
      return { userId: t.user_id, token: t };
    }
    const raw = String(cookie ?? '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('atelier_session='))
      ?.slice('atelier_session='.length);
    assert(raw && /^[A-Za-z0-9_-]{43}$/.test(raw), 401, 'UNAUTHENTICATED', 'Sign in to continue');
    const s = this.db.get(
      'SELECT s.*,u.disabled_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=?',
      hash(raw),
    );
    assert(
      s && !s.disabled_at && s.expires_at > now && s.last_seen + this.idleTtl > now,
      401,
      'SESSION_EXPIRED',
      'Session expired. Sign in again',
    );
    if (now - s.last_seen > 60000)
      this.db.run('UPDATE sessions SET last_seen=? WHERE hash=?', now, s.hash);
    return { userId: s.user_id, session: s };
  }
  csrf(identity, value) {
    if (!identity.token)
      assert(
        identity.session && same(identity.session.csrf, value),
        403,
        'CSRF_FAILED',
        'The security token is missing or invalid',
      );
  }
  logout(identity) {
    if (identity.session) this.db.run('DELETE FROM sessions WHERE hash=?', identity.session.hash);
  }
  me(identity) {
    const u = this.db.get(
      'SELECT id,email,display_name,mfa_secret FROM users WHERE id=?',
      identity.userId,
    );
    const tenants = this.db.all(
      'SELECT t.id,t.name,t.slug,m.role FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=? AND t.deleted_at IS NULL ORDER BY t.name',
      u.id,
    );
    return {
      user: { id: u.id, email: u.email, displayName: u.display_name, mfaEnabled: !!u.mfa_secret },
      tenants: identity.token ? tenants.filter((t) => t.id === identity.token.tenant_id) : tenants,
      csrf: identity.session?.csrf ?? null,
    };
  }
  async changePassword(identity, { currentPassword, newPassword }) {
    const user = this.currentSession(identity);
    const encoded = await this.passwordWork(async () => {
      assert(
        await passwordMatches(currentPassword, user.password_hash),
        401,
        'INVALID_CREDENTIALS',
        'Current password is incorrect',
      );
      return passwordHash(newPassword);
    });
    this.db.transaction(() => {
      this.currentSession(identity, user.password_hash);
      this.db.run('UPDATE users SET password_hash=?,mfa_pending=NULL WHERE id=?', encoded, user.id);
      this.db.run('DELETE FROM sessions WHERE user_id=?', user.id);
      this.db.run(
        'UPDATE api_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',
        this.clock(),
        user.id,
      );
    });
    return { changed: true, signInAgain: true };
  }
  async setupMfa(identity, { password }) {
    const user = this.currentSession(identity);
    assert(!user.mfa_secret, 409, 'MFA_ENABLED', 'Two-factor authentication is already enabled');
    assert(
      await this.passwordWork(() => passwordMatches(password, user.password_hash)),
      401,
      'INVALID_CREDENTIALS',
      'Password is incorrect',
    );
    const secret = newTotpSecret();
    this.db.transaction(() => {
      const latest = this.currentSession(identity, user.password_hash);
      assert(
        !latest.mfa_secret && latest.mfa_pending === user.mfa_pending,
        409,
        'MFA_CHANGED',
        'MFA setup changed elsewhere; reload',
      );
      this.db.run(
        'UPDATE users SET mfa_pending=? WHERE id=?',
        this.box.seal(
          JSON.stringify({ secret, expires: this.clock() + 600000 }),
          `user:${user.id}:pending-totp`,
        ),
        user.id,
      );
    });
    return {
      secret,
      uri: `otpauth://totp/Atelier:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Atelier&algorithm=SHA1&digits=6&period=30`,
    };
  }
  confirmMfa(identity, { code }) {
    return this.db.transaction(() => {
      const user = this.currentSession(identity);
      assert(
        user.mfa_pending && !user.mfa_secret,
        409,
        'MFA_NOT_PENDING',
        'Set up two-factor authentication first',
      );
      const pending = JSON.parse(this.box.open(user.mfa_pending, `user:${user.id}:pending-totp`));
      const counter = verifyTotp(pending.secret, code, { now: this.clock() });
      assert(
        pending.expires > this.clock() && counter !== null,
        400,
        'INVALID_CODE',
        'The code is incorrect or setup expired',
      );
      const recovery = recoveryCodes();
      this.db.run(
        'UPDATE users SET mfa_secret=?,mfa_pending=NULL,mfa_counter=?,recovery_json=? WHERE id=?',
        this.box.seal(pending.secret, `user:${user.id}:totp`),
        counter,
        JSON.stringify(recovery.hashes),
        user.id,
      );
      this.db.run(
        'DELETE FROM sessions WHERE user_id=? AND hash<>?',
        user.id,
        identity.session.hash,
      );
      return { enabled: true, recoveryCodes: recovery.codes };
    });
  }
  async disableMfa(identity, { password, code }) {
    const user = this.currentSession(identity);
    assert(
      user.mfa_secret &&
        (await this.passwordWork(() => passwordMatches(password, user.password_hash))),
      401,
      'INVALID_CREDENTIALS',
      'Password or code is incorrect',
    );
    return this.db.transaction(() => {
      const latest = this.currentSession(identity, user.password_hash);
      assert(latest.mfa_secret, 409, 'MFA_CHANGED', 'MFA configuration changed elsewhere');
      const counter = verifyTotp(this.box.open(latest.mfa_secret, `user:${user.id}:totp`), code, {
        now: this.clock(),
        lastCounter: latest.mfa_counter,
      });
      assert(counter !== null, 401, 'INVALID_CREDENTIALS', 'Password or code is incorrect');
      this.db.run(
        "UPDATE users SET mfa_secret=NULL,mfa_pending=NULL,mfa_counter=-1,recovery_json='[]' WHERE id=?",
        user.id,
      );
      this.db.run(
        'DELETE FROM sessions WHERE user_id=? AND hash<>?',
        user.id,
        identity.session.hash,
      );
      return { enabled: false };
    });
  }
}
