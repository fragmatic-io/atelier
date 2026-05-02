// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  MemoryMarketplaceStorage,
  handleMarketplaceRequest,
  type MarketplaceStorage,
} from '@atelier/vault-server';
import {
  InMemoryTrustedKeyStore,
  MarketplaceClient,
  MarketplaceTrustError,
  SignatureMismatchError,
  computeMarketplaceKeyId,
  type MarketplaceKeyMaterial,
} from '../src/index.js';
import { parseMarketplaceAddress, type SignedBundle } from '@atelier/schemas';

/**
 * Adapt the in-memory marketplace handler into a `fetch`-compatible
 * function so the client can drive it without a socket. Mirrors the
 * pattern in `client.test.ts` for the main vault.
 */
function makeFetcher(storage: MarketplaceStorage): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlText =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlText);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown = null;
    if (typeof init?.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const out = handleMarketplaceRequest(storage, {
      method,
      path: url.pathname,
      query: {},
      headers: {},
      body,
    });
    if (out === null) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    if (out.body === undefined) {
      return Promise.resolve(new Response(null, { status: out.status }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(out.body), {
        status: out.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

/** Generate raw 32-byte ed25519 keypair material via node:crypto. */
function makeKeypair(): MarketplaceKeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  // PKCS8 ed25519 ends with `0x04 0x20 <32-byte seed>`.
  const privateRaw = new Uint8Array(pkcs8.subarray(pkcs8.length - 32));
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const publicRaw = new Uint8Array(spki.subarray(spki.length - 32));
  return { privateKey: privateRaw, publicKey: publicRaw };
}

describe('MarketplaceClient — round-trip', () => {
  let storage: MemoryMarketplaceStorage;
  let client: MarketplaceClient;
  let trustedKeys: InMemoryTrustedKeyStore;

  beforeEach(() => {
    storage = new MemoryMarketplaceStorage();
    trustedKeys = new InMemoryTrustedKeyStore();
    client = new MarketplaceClient({
      vaultUrl: 'http://vault.local',
      fetcher: makeFetcher(storage),
      trustedKeys,
    });
  });

  it('publishes a bundle and reads it back', async () => {
    const key = makeKeypair();
    const out = await client.publish(
      'atelier://acme/email-triage@1.0.0',
      { recipe: 'inbox-zero' },
      key,
    );
    expect(out.address).toBe('atelier://acme/email-triage@1.0.0');
    expect(out.keyId).toBe(await computeMarketplaceKeyId(key.publicKey));

    const payload = await client.fetch('atelier://acme/email-triage@1.0.0');
    expect(payload).toEqual({ recipe: 'inbox-zero' });
  });

  it('records the author key on first fetch (TOFU)', async () => {
    const key = makeKeypair();
    await client.publish('atelier://acme/recipe@1.0.0', { hello: 'world' }, key);
    expect(trustedKeys.get('acme')).toBeUndefined();
    await client.fetch('atelier://acme/recipe@1.0.0');
    expect(trustedKeys.get('acme')).toBe(await computeMarketplaceKeyId(key.publicKey));
  });

  it('rejects a fetch when the cached key fingerprint does not match', async () => {
    const keyA = makeKeypair();
    const keyB = makeKeypair();
    await client.publish('atelier://acme/recipe@1.0.0', { hello: 'world' }, keyA);
    await client.fetch('atelier://acme/recipe@1.0.0');

    // Re-publish under the same address with a NEW key (rotation event).
    await client.publish('atelier://acme/recipe@2.0.0', { hello: 'rotated' }, keyB);
    let caught: unknown;
    try {
      await client.fetch('atelier://acme/recipe@2.0.0');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MarketplaceTrustError);
    if (caught instanceof MarketplaceTrustError) {
      expect(caught.author).toBe('acme');
      expect(caught.knownKeyId).toBe(await computeMarketplaceKeyId(keyA.publicKey));
      expect(caught.observedKeyId).toBe(await computeMarketplaceKeyId(keyB.publicKey));
    }
  });

  it('detects a tampered bundle on fetch', async () => {
    const key = makeKeypair();
    await client.publish('atelier://acme/recipe@1.0.0', { v: 1 }, key);
    // Mutate the bundle in storage AFTER publish to simulate a bad-actor
    // mutation in the storage layer.
    const stored = storage.get(
      parseMarketplaceAddress('atelier://acme/recipe@1.0.0')!,
    ) as SignedBundle;
    storage.put(stored.address, { ...stored, payload: { v: 'tampered' } });
    let caught: unknown;
    try {
      await client.fetch('atelier://acme/recipe@1.0.0');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignatureMismatchError);
  });

  it('honours ?signed_by= pinning', async () => {
    const key = makeKeypair();
    await client.publish('atelier://acme/recipe@1.0.0', { v: 1 }, key);
    const keyId = await computeMarketplaceKeyId(key.publicKey);
    const payload = await client.fetch(`atelier://acme/recipe@1.0.0?signed_by=${keyId}`);
    expect(payload).toEqual({ v: 1 });
  });

  it('rejects when ?signed_by= does not match', async () => {
    const key = makeKeypair();
    await client.publish('atelier://acme/recipe@1.0.0', { v: 1 }, key);
    let caught: unknown;
    try {
      await client.fetch('atelier://acme/recipe@1.0.0?signed_by=ffffffffffffffff');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MarketplaceTrustError);
  });

  it('?signed_by= bypasses the TOFU cache', async () => {
    const keyA = makeKeypair();
    const keyB = makeKeypair();
    // Cache one key for `acme`.
    await client.publish('atelier://acme/r1@1.0.0', {}, keyA);
    await client.fetch('atelier://acme/r1@1.0.0');
    // Now publish under a new key + pin to it on the fetch — should succeed.
    await client.publish('atelier://acme/r2@1.0.0', { ok: true }, keyB);
    const keyIdB = await computeMarketplaceKeyId(keyB.publicKey);
    const payload = await client.fetch(`atelier://acme/r2@1.0.0?signed_by=${keyIdB}`);
    expect(payload).toEqual({ ok: true });
    // TOFU cache for `acme` still points at the FIRST key (the pin doesn't update it).
    expect(trustedKeys.get('acme')).toBe(await computeMarketplaceKeyId(keyA.publicKey));
  });

  it('returns a useful error on a missing bundle', async () => {
    await expect(client.fetch('atelier://acme/missing@1.0.0')).rejects.toThrow(/HTTP 404/);
  });
});

describe('TrustedKeyStore — InMemory', () => {
  it('stores + clears per author', () => {
    const store = new InMemoryTrustedKeyStore();
    expect(store.get('a')).toBeUndefined();
    store.set('a', 'fp1');
    expect(store.get('a')).toBe('fp1');
    store.clear('a');
    expect(store.get('a')).toBeUndefined();
  });
});
