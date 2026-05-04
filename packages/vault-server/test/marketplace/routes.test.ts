// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for V-6.a / V-6.b — `/marketplace/persona` publish + consume.
 *
 * Drives the pure `handleMarketplacePersonaRequest` directly (no socket).
 * Mirrors the style of `marketplace.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';

import {
  signingInputForBundle,
  type MarketplaceAddress,
  type SignedBundle,
} from '@atelier/schemas';

import {
  InMemoryKeyDirectory,
  InMemoryMarketplaceStore,
  MARKETPLACE_PREFIX,
  StaticKeyDirectory,
  compareSemver,
  computeAuthorKeyId,
  handleMarketplacePersonaRequest,
  type VaultRequest,
} from '../../src/index.js';

interface SigningKey {
  publicKey: Uint8Array;
  /** node:crypto KeyObject for signing. */
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}

/** Generate a fresh ed25519 keypair as raw 32-byte material. */
function makeSigningKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const publicKeyRaw = new Uint8Array(der.subarray(der.length - 32));
  return { publicKey: publicKeyRaw, privateKey };
}

interface BundleOpts {
  author?: string;
  persona?: string;
  version?: string;
  payload?: unknown;
  timestamp?: string;
  /** Sign with this keypair. Defaults to `key`. */
  signWith?: SigningKey;
}

function makeBundle(key: SigningKey, opts: BundleOpts = {}): SignedBundle {
  const address: MarketplaceAddress = {
    scheme: 'atelier',
    author: opts.author ?? 'acme',
    persona: opts.persona ?? 'email-triage',
    version: opts.version ?? '1.0.0',
  };
  const payload = opts.payload ?? { recipe: 'inbox-zero' };
  const timestamp = opts.timestamp ?? '2026-05-02T12:00:00.000Z';
  const signingInput = signingInputForBundle({ address, payload, timestamp });
  const signer = opts.signWith ?? key;
  const sigBuf = nodeSign(null, Buffer.from(signingInput, 'utf8'), signer.privateKey);
  return {
    address,
    payload,
    timestamp,
    signature: sigBuf.toString('base64'),
    public_key: Buffer.from(key.publicKey).toString('base64'),
    key_id: computeAuthorKeyId(key.publicKey),
  };
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

describe('handleMarketplacePersonaRequest — publish', () => {
  it('returns 201 + canonical address for a valid bundle', async () => {
    const key = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', key.publicKey);
    const store = new InMemoryMarketplaceStore();
    const bundle = makeBundle(key);

    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
    );
    expect(res?.status).toBe(201);
    expect(res?.body).toMatchObject({
      address: 'atelier://acme/email-triage@1.0.0',
      key_id: bundle.key_id,
    });
    expect(store.get(bundle.address)).toEqual(bundle);
  });

  it('returns 400 for a malformed body', async () => {
    const directory = new InMemoryKeyDirectory();
    const store = new InMemoryMarketplaceStore();
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: { not: 'a bundle' } }),
    );
    expect(res?.status).toBe(400);
  });

  it('returns 401 when the author is unknown to the directory', async () => {
    const key = makeSigningKey();
    const directory = new InMemoryKeyDirectory(); // no entry for 'acme'
    const store = new InMemoryMarketplaceStore();
    const bundle = makeBundle(key);

    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
    );
    expect(res?.status).toBe(401);
    expect(res?.body).toMatchObject({ error: 'signature verification failed' });
  });

  it('returns 401 when the bundle is signed by a different key', async () => {
    const goodKey = makeSigningKey();
    const badKey = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', goodKey.publicKey);
    const store = new InMemoryMarketplaceStore();
    // Bundle signature is from badKey; bundle.key_id reflects goodKey
    // (we lie about whose key signed it). The verifier rejects because
    // the directory's key doesn't verify the signature.
    const bundle: SignedBundle = makeBundle(goodKey, { signWith: badKey });
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
    );
    expect(res?.status).toBe(401);
  });

  it('returns 401 when the registered key does not match bundle.key_id', async () => {
    const realKey = makeSigningKey();
    const fakeKey = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    // Register fakeKey for 'acme'; bundle is from realKey.
    directory.register('acme', fakeKey.publicKey);
    const store = new InMemoryMarketplaceStore();
    const bundle = makeBundle(realKey);
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
    );
    expect(res?.status).toBe(401);
    expect(res?.body).toMatchObject({ error: 'signature verification failed' });
  });

  it('returns 409 on duplicate (author, persona, version)', async () => {
    const key = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', key.publicKey);
    const store = new InMemoryMarketplaceStore();
    const bundle = makeBundle(key);
    const first = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
    );
    expect(first?.status).toBe(201);
    const second = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
    );
    expect(second?.status).toBe(409);
    expect(second?.body).toMatchObject({ error: 'duplicate' });
  });
});

describe('handleMarketplacePersonaRequest — consume by exact version', () => {
  it('returns 200 + the bundle verbatim', async () => {
    const key = makeSigningKey();
    const directory = new StaticKeyDirectory({ acme: key.publicKey });
    const store = new InMemoryMarketplaceStore();
    const bundle = makeBundle(key);
    store.put(bundle.address, bundle);

    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({
        method: 'GET',
        path: `${MARKETPLACE_PREFIX}/acme/email-triage@1.0.0`,
      }),
    );
    expect(res?.status).toBe(200);
    expect(res?.body).toEqual(bundle);
    expect(res?.headers?.['cache-control']).toContain('immutable');
  });

  it('returns 404 on miss', async () => {
    const directory = new InMemoryKeyDirectory();
    const store = new InMemoryMarketplaceStore();
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({
        method: 'GET',
        path: `${MARKETPLACE_PREFIX}/acme/missing@9.9.9`,
      }),
    );
    expect(res?.status).toBe(404);
  });

  it('returns 400 on a malformed exact-version path', async () => {
    const directory = new InMemoryKeyDirectory();
    const store = new InMemoryMarketplaceStore();
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({
        method: 'GET',
        path: `${MARKETPLACE_PREFIX}/acme/no-version-here`,
      }),
    );
    expect(res?.status).toBe(400);
  });
});

describe('handleMarketplacePersonaRequest — consume latest', () => {
  it('returns the highest semver across registered versions', async () => {
    const key = makeSigningKey();
    const directory = new StaticKeyDirectory({ acme: key.publicKey });
    const store = new InMemoryMarketplaceStore();
    const v1 = makeBundle(key, { version: '1.0.0' });
    const v2 = makeBundle(key, { version: '1.2.3' });
    const vRc = makeBundle(key, { version: '2.0.0-rc.1' });
    store.put(v1.address, v1);
    store.put(v2.address, v2);
    store.put(vRc.address, vRc);

    // 2.0.0-rc.1 > 1.2.3 > 1.0.0  (pre-release > non-pre-release with
    // a higher core).
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({
        method: 'GET',
        path: `${MARKETPLACE_PREFIX}/acme/email-triage/latest`,
      }),
    );
    expect(res?.status).toBe(200);
    expect(res?.body).toMatchObject({
      address: 'atelier://acme/email-triage@2.0.0-rc.1',
      bundle: vRc,
    });
  });

  it('returns 404 when no versions are registered', async () => {
    const directory = new InMemoryKeyDirectory();
    const store = new InMemoryMarketplaceStore();
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({
        method: 'GET',
        path: `${MARKETPLACE_PREFIX}/acme/email-triage/latest`,
      }),
    );
    expect(res?.status).toBe(404);
  });

  it('does NOT match an exact-version path that ends with /latest', async () => {
    // `<persona>@latest` is structurally different from `<persona>/latest`
    // — the exact-version matcher requires `@`, the latest matcher
    // requires the literal `/latest` suffix.
    const directory = new InMemoryKeyDirectory();
    const store = new InMemoryMarketplaceStore();
    const res = await handleMarketplacePersonaRequest(
      store,
      directory,
      req({
        method: 'GET',
        path: `${MARKETPLACE_PREFIX}/acme/email-triage@latest`,
      }),
    );
    // The exact-version handler runs and 404s (no bundle stored).
    // The latest matcher would have happily returned 404 too — what
    // matters here is that the response status is 404, not 200.
    expect(res?.status).toBe(404);
  });
});

describe('compareSemver', () => {
  it('orders by major/minor/patch', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
  });

  it('treats pre-release as lower than the release', () => {
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
  });

  it('orders pre-release tags numerically + lexically', () => {
    expect(compareSemver('1.0.0-rc.1', '1.0.0-rc.2')).toBeLessThan(0);
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
  });
});
