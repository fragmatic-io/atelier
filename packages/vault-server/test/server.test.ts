// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JsonFileVaultStorage,
  MemoryVaultStorage,
  VaultService,
  handleVaultRequest,
  loadOrGenerateKeyPair,
  startVaultServer,
  type VaultRequest,
} from '../src/index.js';
import type { VaultRevocationTrigger } from '../src/index.js';
import type { IntentProfile } from '@cir/schemas';

const seedProfile = (): IntentProfile => ({
  user_id: 'demo-user',
  profile_version: 1,
  updated_at: '2026-04-30T00:00:00.000Z',
  global_preferences: {
    density: 'comfortable',
    granted_scopes: ['lens.today'],
  },
  lenses: { today: 'default', thread: 'compact', github: 'tableview' },
  rules: [
    { scope: 'today', rule: 'mark Sundays as read', version: 0 },
    { scope: 'github', rule: 'highlight reviews', version: 0 },
  ],
  vocabulary: { me: 'Vid' },
});

function makeService(opts?: {
  now?: () => number;
  onRevoked?: (e: VaultRevocationTrigger) => void | Promise<void>;
}): VaultService {
  const storage = new MemoryVaultStorage();
  storage.putProfile(seedProfile());
  const { pair } = loadOrGenerateKeyPair(undefined);
  return new VaultService({
    storage,
    key: pair,
    issuer: 'vault-test',
    ...(opts?.now ? { now: opts.now } : {}),
    ...(opts?.onRevoked ? { onRevoked: opts.onRevoked } : {}),
  });
}

function req(opts: Partial<VaultRequest> & { method: string; path: string }): VaultRequest {
  return {
    method: opts.method,
    path: opts.path,
    query: opts.query ?? {},
    headers: opts.headers ?? {},
    body: opts.body ?? null,
  };
}

describe('handleVaultRequest — JWKS', () => {
  it('serves the active key', async () => {
    const svc = makeService();
    const res = await handleVaultRequest(
      svc,
      req({ method: 'GET', path: '/.well-known/jwks.json' }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { keys: { kid: string }[] };
    expect(body.keys[0]?.kid).toBe(svc.key.kid);
  });
});

describe('handleVaultRequest — POST /vault/grants', () => {
  it('mints a token for valid input', async () => {
    const svc = makeService();
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'POST',
        path: '/vault/grants',
        body: { app_id: 'cir.demo', scopes: ['lens.today', 'vocabulary.read'] },
      }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { token: string; jti: string; expires_at: string };
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.jti).toMatch(/^g_[a-f0-9]+$/);
  });

  it('rejects a request without app_id', async () => {
    const svc = makeService();
    const res = await handleVaultRequest(
      svc,
      req({ method: 'POST', path: '/vault/grants', body: { scopes: ['lens.today'] } }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty scopes', async () => {
    const svc = makeService();
    const res = await handleVaultRequest(
      svc,
      req({ method: 'POST', path: '/vault/grants', body: { app_id: 'cir.demo', scopes: [] } }),
    );
    expect(res.status).toBe(400);
  });

  it('caps overlong TTLs at the configured max', async () => {
    const svc = makeService({ now: () => 1_000_000 });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'POST',
        path: '/vault/grants',
        body: {
          app_id: 'cir.demo',
          scopes: ['lens.today'],
          expiry_seconds: 60 * 60 * 24 * 365, // 1 year
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { expires_at: string };
    const expSec = Math.floor(new Date(body.expires_at).getTime() / 1000);
    // Capped at 30 days from `now`.
    expect(expSec - 1_000_000).toBe(60 * 60 * 24 * 30);
  });
});

describe('handleVaultRequest — GET /vault/profile (auth + filter)', () => {
  it('returns the slice authorized by the token', async () => {
    const svc = makeService();
    const minted = svc.mintGrant({
      app_id: 'cir.demo',
      scopes: ['lens.today', 'vocabulary.read'],
    });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'GET',
        path: '/vault/profile',
        query: { aud: 'cir.demo' },
        headers: { authorization: `Bearer ${minted.token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { profile: IntentProfile };
    expect(Object.keys(body.profile.lenses)).toEqual(['today']);
    expect(body.profile.vocabulary).toEqual({ me: 'Vid' });
  });

  it('401s when the bearer is missing', async () => {
    const svc = makeService();
    const res = await handleVaultRequest(
      svc,
      req({ method: 'GET', path: '/vault/profile', query: { aud: 'cir.demo' } }),
    );
    expect(res.status).toBe(401);
  });

  it('401s when the token has expired', async () => {
    let now = 1_000_000;
    const svc = makeService({ now: () => now });
    const minted = svc.mintGrant({
      app_id: 'cir.demo',
      scopes: ['lens.today'],
      expiry_seconds: 60,
    });
    now = 1_000_061; // jump past expiry
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'GET',
        path: '/vault/profile',
        query: { aud: 'cir.demo' },
        headers: { authorization: `Bearer ${minted.token}` },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('401s when the audience does not match', async () => {
    const svc = makeService();
    const minted = svc.mintGrant({ app_id: 'cir.demo', scopes: ['lens.today'] });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'GET',
        path: '/vault/profile',
        query: { aud: 'other.app' },
        headers: { authorization: `Bearer ${minted.token}` },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('401s when the token is malformed', async () => {
    const svc = makeService();
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'GET',
        path: '/vault/profile',
        query: { aud: 'cir.demo' },
        headers: { authorization: 'Bearer not.a.jwt' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('404s when the user has no profile', async () => {
    const storage = new MemoryVaultStorage();
    const { pair } = loadOrGenerateKeyPair(undefined);
    const svc = new VaultService({ storage, key: pair, issuer: 'vault-test' });
    const minted = svc.mintGrant({
      app_id: 'cir.demo',
      scopes: ['lens.today'],
      user_id: 'ghost',
    });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'GET',
        path: '/vault/profile',
        query: { aud: 'cir.demo' },
        headers: { authorization: `Bearer ${minted.token}` },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('handleVaultRequest — PATCH /vault/profile', () => {
  it('applies a write authorized by the token', async () => {
    const svc = makeService();
    const minted = svc.mintGrant({ app_id: 'cir.demo', scopes: ['lens.today'] });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'PATCH',
        path: '/vault/profile',
        headers: { authorization: `Bearer ${minted.token}` },
        body: { lenses: { today: 'compact-cards' } },
      }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { profile: IntentProfile };
    expect(body.profile.lenses['today']).toBe('compact-cards');
  });

  it('rejects a lens write to a domain not in the scope set', async () => {
    const svc = makeService();
    const minted = svc.mintGrant({ app_id: 'cir.demo', scopes: ['lens.today'] });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'PATCH',
        path: '/vault/profile',
        headers: { authorization: `Bearer ${minted.token}` },
        // The token has lens.today but is trying to write `lens.calendar`.
        // The whole `lenses` patch is rejected because no covered domain
        // appears in it.
        body: { lenses: { calendar: 'agenda' } },
      }),
    );
    expect(res.status).toBe(403);
    const body = res.body as { denied: string[] };
    expect(body.denied).toContain('lenses');
  });

  it('admits a multi-domain lens patch only for covered domains', async () => {
    const svc = makeService();
    const minted = svc.mintGrant({
      app_id: 'cir.demo',
      scopes: ['lens.today', 'lens.thread'],
    });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'PATCH',
        path: '/vault/profile',
        headers: { authorization: `Bearer ${minted.token}` },
        // `today` and `thread` are in scope; `calendar` is silently filtered
        // out (the partial admits the covered keys).
        body: { lenses: { today: 'list', thread: 'expanded', calendar: 'agenda' } },
      }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { profile: IntentProfile };
    expect(body.profile.lenses['today']).toBe('list');
    expect(body.profile.lenses['thread']).toBe('expanded');
    // Calendar wasn't authorized, was silently dropped from the patch.
    expect(body.profile.lenses['calendar']).toBeUndefined();
  });

  it('403s when the entire patch is unauthorized', async () => {
    const svc = makeService();
    const minted = svc.mintGrant({ app_id: 'cir.demo', scopes: ['lens.today.read'] });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'PATCH',
        path: '/vault/profile',
        headers: { authorization: `Bearer ${minted.token}` },
        body: { vocabulary: { me: 'X' } },
      }),
    );
    expect(res.status).toBe(403);
    const body = res.body as { denied: string[] };
    expect(body.denied).toContain('vocabulary');
  });

  it('bumps profile_version + updated_at on success', async () => {
    let now = 1_700_000_000;
    const svc = makeService({ now: () => now });
    const minted = svc.mintGrant({ app_id: 'cir.demo', scopes: ['lens.today'] });
    now = 1_700_000_500;
    await handleVaultRequest(
      svc,
      req({
        method: 'PATCH',
        path: '/vault/profile',
        headers: { authorization: `Bearer ${minted.token}` },
        body: { lenses: { today: 'list' } },
      }),
    );
    const stored = svc.storage.getProfile('demo-user');
    expect(stored?.profile_version).toBe(2);
    expect(stored?.updated_at).toBe(new Date(1_700_000_500_000).toISOString());
  });
});

describe('handleVaultRequest — DELETE /vault/grants/:jti', () => {
  it("revokes the caller's own grant and emits the trigger", async () => {
    const triggers: VaultRevocationTrigger[] = [];
    const svc = makeService({ onRevoked: (e) => void triggers.push(e) });
    const minted = svc.mintGrant({ app_id: 'cir.demo', scopes: ['lens.today'] });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'DELETE',
        path: `/vault/grants/${minted.record.jti}`,
        headers: { authorization: `Bearer ${minted.token}` },
      }),
    );
    expect(res.status).toBe(204);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.app_id).toBe('cir.demo');
    expect(triggers[0]?.reason).toBe('self_revoked');

    // A subsequent read with the same token now 401s.
    const followup = await handleVaultRequest(
      svc,
      req({
        method: 'GET',
        path: '/vault/profile',
        query: { aud: 'cir.demo' },
        headers: { authorization: `Bearer ${minted.token}` },
      }),
    );
    expect(followup.status).toBe(401);
  });

  it('refuses to revoke another grant without vault.admin', async () => {
    const svc = makeService();
    const a = svc.mintGrant({ app_id: 'cir.demo', scopes: ['lens.today'] });
    const b = svc.mintGrant({ app_id: 'other.app', scopes: ['lens.today'] });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'DELETE',
        path: `/vault/grants/${b.record.jti}`,
        headers: { authorization: `Bearer ${a.token}` },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('404s when the jti is unknown', async () => {
    const svc = makeService();
    const minted = svc.mintGrant({ app_id: 'cir.demo', scopes: ['vault.admin'] });
    const res = await handleVaultRequest(
      svc,
      req({
        method: 'DELETE',
        path: '/vault/grants/g_does_not_exist',
        headers: { authorization: `Bearer ${minted.token}` },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('handleVaultRequest — fall-through', () => {
  it('returns 404 for unknown routes', async () => {
    const svc = makeService();
    const res = await handleVaultRequest(svc, req({ method: 'GET', path: '/no/such/path' }));
    expect(res.status).toBe(404);
  });
});

describe('startVaultServer (live HTTP)', () => {
  it('listens on a port and returns JWKS', async () => {
    const storage = new MemoryVaultStorage();
    storage.putProfile(seedProfile());
    const { pair } = loadOrGenerateKeyPair(undefined);
    const running = await startVaultServer({
      storage,
      key: pair,
      issuer: 'vault-test',
      port: 0,
    });
    try {
      expect(running.port).toBeGreaterThan(0);
      const res = await fetch(`http://127.0.0.1:${running.port}/.well-known/jwks.json`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { keys: unknown[] };
      expect(body.keys).toHaveLength(1);
    } finally {
      await running.close();
    }
  });

  it('round-trips a grant + profile read over HTTP', async () => {
    const storage = new MemoryVaultStorage();
    storage.putProfile(seedProfile());
    const { pair } = loadOrGenerateKeyPair(undefined);
    const running = await startVaultServer({
      storage,
      key: pair,
      issuer: 'vault-test',
      port: 0,
    });
    try {
      const grantRes = await fetch(`http://127.0.0.1:${running.port}/vault/grants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app_id: 'cir.demo', scopes: ['lens.today'] }),
      });
      const grant = (await grantRes.json()) as { token: string };
      const profRes = await fetch(`http://127.0.0.1:${running.port}/vault/profile?aud=cir.demo`, {
        headers: { authorization: `Bearer ${grant.token}` },
      });
      const profile = (await profRes.json()) as { profile: IntentProfile };
      expect(profile.profile.lenses['today']).toBe('default');
    } finally {
      await running.close();
    }
  });
});

describe('JsonFileVaultStorage', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cir-vault-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists profiles + grants across instances', () => {
    const file = join(dir, 'vault.json');
    const a = new JsonFileVaultStorage(file);
    a.putProfile(seedProfile());
    a.putGrant({
      jti: 'g_persist',
      app_id: 'cir.demo',
      user_id: 'demo-user',
      scopes: ['lens.today'],
      iat: 1,
      exp: 2,
    });
    const b = new JsonFileVaultStorage(file);
    expect(b.getProfile('demo-user')?.lenses['today']).toBe('default');
    expect(b.getGrant('g_persist')?.app_id).toBe('cir.demo');
  });

  it('records revoked_at on revoke', () => {
    const file = join(dir, 'vault.json');
    const s = new JsonFileVaultStorage(file);
    s.putGrant({
      jti: 'g_revokeme',
      app_id: 'cir.demo',
      user_id: 'demo-user',
      scopes: [],
      iat: 1,
      exp: 100,
    });
    const updated = s.revokeGrant('g_revokeme', 50);
    expect(updated?.revoked_at).toBe(50);
    const reloaded = new JsonFileVaultStorage(file);
    expect(reloaded.getGrant('g_revokeme')?.revoked_at).toBe(50);
  });

  it('returns undefined when revoking an unknown jti', () => {
    const file = join(dir, 'vault.json');
    const s = new JsonFileVaultStorage(file);
    expect(s.revokeGrant('g_nope', 1)).toBeUndefined();
  });
});

describe('day-rollover semantics for expiries', () => {
  it('exp is the iat + ttl in seconds; mid-day grants land mid-day +24h', () => {
    let now = Date.parse('2026-04-30T15:30:00.000Z') / 1000;
    const svc = makeService({ now: () => now });
    const minted = svc.mintGrant({
      app_id: 'cir.demo',
      scopes: ['lens.today'],
      expiry_seconds: 24 * 60 * 60,
    });
    expect(minted.claims.exp - minted.claims.iat).toBe(24 * 60 * 60);
    // The token is still valid 23h59m later.
    now += 23 * 60 * 60 + 59 * 60;
    expect(() => svc.verifyBearer(minted.token, 'cir.demo')).not.toThrow();
    // Past 24h+1s, it expires regardless of UTC day boundary.
    now += 2 * 60;
    expect(() => svc.verifyBearer(minted.token, 'cir.demo')).toThrow(/expired/);
  });
});
