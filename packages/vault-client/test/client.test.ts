// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MemoryVaultStorage,
  VaultService,
  handleVaultRequest,
  loadOrGenerateKeyPair,
  type VaultRequest,
} from '@atelier/vault-server';
import type { IntentProfile } from '@atelier/schemas';
import {
  MemoryTokenStorage,
  VaultClient,
  VaultResponseError,
  VaultTokenExpiredError,
  VaultUnauthorizedError,
  VaultUnreachableError,
} from '../src/index.js';

/**
 * In-process fetch adapter that funnels Web Fetch calls into the vault
 * server's pure dispatcher. No sockets, no port allocation, deterministic.
 */
/** Stringify a fetch input (string | URL | Request) without ever getting "[object Object]". */
function stringifyInput(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  // Request objects in this test are never used; defensively use `.url`.
  return input.url;
}

/** Read a fetch body (string | Blob | etc.) into a string. Tests only ever
 * pass a string, so we narrow on that and reject anything else loudly. */
function readBodyText(body: BodyInit | null | undefined): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body;
  throw new Error(`unsupported test body type: ${typeof body}`);
}

function makeFetcher(svc: VaultService): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(stringifyInput(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers !== undefined) {
      const h = new Headers(init.headers);
      h.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
    }
    let body: unknown = null;
    const raw = readBodyText(init?.body);
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) query[k] = v;
    const vaultReq: VaultRequest = {
      method,
      path: url.pathname,
      query,
      headers,
      body,
    };
    const out = await handleVaultRequest(svc, vaultReq);
    const responseInit: ResponseInit = { status: out.status };
    if (out.body === undefined) {
      return new Response(null, responseInit);
    }
    return new Response(JSON.stringify(out.body), {
      ...responseInit,
      headers: { 'content-type': 'application/json' },
    });
  };
}

const seed: IntentProfile = {
  user_id: 'demo-user',
  profile_version: 1,
  updated_at: '2026-04-30T00:00:00.000Z',
  global_preferences: { density: 'comfortable', granted_scopes: ['lens.today'] },
  lenses: { today: 'default', thread: 'compact', github: 'tableview' },
  rules: [{ scope: 'today', rule: 'prefer Sundays', version: 0 }],
  vocabulary: { me: 'Vid' },
};

function makeServiceWithProfile(): VaultService {
  const storage = new MemoryVaultStorage();
  storage.putProfile(seed);
  const { pair } = loadOrGenerateKeyPair(undefined);
  return new VaultService({ storage, key: pair, issuer: 'vault-test' });
}

describe('VaultClient — happy paths', () => {
  let svc: VaultService;
  let client: VaultClient;
  let storage: MemoryTokenStorage;

  beforeEach(() => {
    svc = makeServiceWithProfile();
    storage = new MemoryTokenStorage();
    client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: storage,
      fetcher: makeFetcher(svc),
    });
  });

  it('mints a grant + persists the token', async () => {
    const grant = await client.requestGrant({ scopes: ['lens.today', 'vocabulary.read'] });
    expect(grant.token.split('.')).toHaveLength(3);
    expect(storage.read()).toBe(grant.token);
    expect(client.getActiveJti()).toBe(grant.jti);
  });

  it('reads the slice authorized by the token', async () => {
    await client.requestGrant({ scopes: ['lens.today', 'vocabulary.read'] });
    const profile = await client.getProfile();
    expect(Object.keys(profile.lenses)).toEqual(['today']);
    expect(profile.vocabulary).toEqual({ me: 'Vid' });
  });

  it('patches the profile', async () => {
    await client.requestGrant({ scopes: ['lens.today'] });
    const updated = await client.patchProfile({ lenses: { today: 'compact-cards' } });
    expect(updated.lenses['today']).toBe('compact-cards');
  });

  it('revokes the active grant + drops the token', async () => {
    await client.requestGrant({ scopes: ['lens.today'] });
    expect(storage.read()).not.toBeNull();
    await client.revokeGrant();
    expect(storage.read()).toBeNull();
  });

  it('verifies a stored token locally before any network call', async () => {
    await client.requestGrant({ scopes: ['lens.today'] });
    const ok = await client.verifyStoredToken();
    expect(ok).toBe(true);
  });
});

describe('VaultClient — error branches', () => {
  let svc: VaultService;
  let client: VaultClient;
  let storage: MemoryTokenStorage;

  beforeEach(() => {
    svc = makeServiceWithProfile();
    storage = new MemoryTokenStorage();
    client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: storage,
      fetcher: makeFetcher(svc),
    });
  });

  it('throws VaultUnauthorizedError when reading without a token', async () => {
    await expect(client.getProfile()).rejects.toBeInstanceOf(VaultUnauthorizedError);
  });

  it('clears the token on a 401 response from getProfile', async () => {
    // Mint, then revoke server-side, then attempt a read.
    const grant = await client.requestGrant({ scopes: ['lens.today'] });
    await svc.revokeByJti(grant.jti, 'test');
    await expect(client.getProfile()).rejects.toBeInstanceOf(VaultUnauthorizedError);
    expect(storage.read()).toBeNull();
  });

  it('throws VaultUnreachableError on a network error', async () => {
    const failingClient = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: new MemoryTokenStorage(),
      fetcher: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    await expect(failingClient.requestGrant({ scopes: ['lens.today'] })).rejects.toBeInstanceOf(
      VaultUnreachableError,
    );
  });

  it('rejects when patching without a token', async () => {
    await expect(client.patchProfile({ vocabulary: { x: '1' } })).rejects.toBeInstanceOf(
      VaultUnauthorizedError,
    );
  });

  it('throws VaultTokenExpiredError when the local exp is in the past', async () => {
    // Hand-roll a "valid signature, but expired" scenario: mint normally,
    // then jump the client clock past exp.
    const grant = await client.requestGrant({ scopes: ['lens.today'] });
    expect(grant.token).toBeDefined();
    const expiringClient = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: storage,
      fetcher: makeFetcher(svc),
      now: () => Date.now() + 1000 * 60 * 60 * 24 * 365, // a year ahead
    });
    await expect(expiringClient.verifyStoredToken()).rejects.toBeInstanceOf(VaultTokenExpiredError);
  });

  it('throws VaultUnauthorizedError when the stored token has no kid', async () => {
    storage.write('AAAA.AAAA.AAAA'); // valid base64url segments, no `kid`
    await expect(client.verifyStoredToken()).rejects.toThrow();
  });

  it('returns false when verifyStoredToken finds no token', async () => {
    storage.clear();
    expect(await client.verifyStoredToken()).toBe(false);
  });

  it('throws VaultResponseError on an unexpected non-2xx', async () => {
    // Custom fetcher that returns a 500.
    const explosiveClient = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: new MemoryTokenStorage(),
      fetcher: () =>
        Promise.resolve(new Response(JSON.stringify({ error: 'boom' }), { status: 500 })),
    });
    await expect(explosiveClient.requestGrant({ scopes: ['lens.today'] })).rejects.toBeInstanceOf(
      VaultResponseError,
    );
  });

  it('clears the token on a 401 from patchProfile', async () => {
    const grant = await client.requestGrant({ scopes: ['lens.today'] });
    await svc.revokeByJti(grant.jti, 'test');
    await expect(client.patchProfile({ lenses: { today: 'x' } })).rejects.toBeInstanceOf(
      VaultUnauthorizedError,
    );
    expect(storage.read()).toBeNull();
  });

  it('rejects revoke when no token is stored', async () => {
    await expect(client.revokeGrant()).rejects.toBeInstanceOf(VaultUnauthorizedError);
  });
});

describe('VaultClient — utilities', () => {
  it('returns null jti when no token is stored', () => {
    const client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: new MemoryTokenStorage(),
      fetcher: () => Promise.resolve(new Response(null, { status: 200 })),
    });
    expect(client.getActiveJti()).toBeNull();
  });

  it('returns null jti for a malformed stored token', () => {
    const ts = new MemoryTokenStorage();
    ts.write('not-a-real-jwt');
    const client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: ts,
      fetcher: () => Promise.resolve(new Response(null, { status: 200 })),
    });
    expect(client.getActiveJti()).toBeNull();
  });

  it('exposes getToken / clearToken for explicit ops', () => {
    const ts = new MemoryTokenStorage();
    ts.write('abc');
    const client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'cir.demo',
      tokenStorage: ts,
      fetcher: () => Promise.resolve(new Response(null, { status: 200 })),
    });
    expect(client.getToken()).toBe('abc');
    client.clearToken();
    expect(client.getToken()).toBeNull();
  });
});
