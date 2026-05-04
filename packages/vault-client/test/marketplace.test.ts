// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import {
  InMemoryKeyDirectory,
  InMemoryMarketplaceStore,
  InMemoryReviewStore,
  InMemoryReviewerKeyDirectory,
  MemoryMarketplaceStorage,
  handleMarketplaceIndexRequest,
  handleMarketplacePersonaRequest,
  handleMarketplaceRequest,
  handleMarketplaceReviewRequest,
  type KeyDirectory,
  type MarketplaceStorage,
  type MarketplaceStore,
  type ReviewStore,
  type ReviewerKeyDirectory,
} from '@atelier/vault-server';
import {
  InMemoryTrustedKeyStore,
  MarketplaceClient,
  MarketplaceError,
  MarketplaceTrustError,
  SignatureMismatchError,
  VaultClient,
  computeMarketplaceKeyId,
  fetchReview,
  listMarketplace,
  submitReview,
  type MarketplaceKeyMaterial,
} from '../src/index.js';
import {
  parseMarketplaceAddress,
  signingInputForBundle,
  type ReviewState,
  type SignedBundle,
} from '@atelier/schemas';

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

// ---------------------------------------------------------------------------
// V-6.d — submitReview / fetchReview / listMarketplace helpers.
// ---------------------------------------------------------------------------

interface RawKey {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  /** node:crypto KeyObject for signing the publish bundle. */
  privateKeyObject: ReturnType<typeof generateKeyPairSync>['privateKey'];
}

function makeRawKey(): RawKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const privateRaw = new Uint8Array(pkcs8.subarray(pkcs8.length - 32));
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const publicRaw = new Uint8Array(spki.subarray(spki.length - 32));
  return { privateKey: privateRaw, publicKey: publicRaw, privateKeyObject: privateKey };
}

function makeReviewFetcher(
  bundleStore: MarketplaceStore,
  authorDir: KeyDirectory,
  reviewStore: ReviewStore,
  reviewerDir: ReviewerKeyDirectory,
  fixedNow?: () => string,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlText =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlText);
    const method = (init?.method ?? 'GET').toUpperCase();
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    let body: unknown = null;
    if (typeof init?.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const reqIn = { method, path: url.pathname, query, headers: {}, body };
    const persona = await handleMarketplacePersonaRequest(
      bundleStore,
      authorDir,
      reqIn,
      reviewStore,
    );
    if (persona !== null) return jsonResponse(persona.status, persona.body);
    const review = await handleMarketplaceReviewRequest(
      bundleStore,
      reviewStore,
      reviewerDir,
      reqIn,
      fixedNow,
    );
    if (review !== null) return jsonResponse(review.status, review.body);
    const idx = await handleMarketplaceIndexRequest(bundleStore, reviewStore, reqIn);
    if (idx !== null) return jsonResponse(idx.status, idx.body);
    return new Response(null, { status: 404 });
  };
}

function jsonResponse(status: number, body: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function publishBundle(
  bundleStore: MarketplaceStore,
  authorDir: KeyDirectory,
  reviewStore: ReviewStore,
  authorKey: RawKey,
  version = '1.0.0',
): SignedBundle {
  const address = {
    scheme: 'atelier' as const,
    author: 'acme',
    persona: 'email-triage',
    version,
  };
  const payload = { recipe: 'inbox-zero', description: `desc-${version}` };
  const timestamp = '2026-05-02T12:00:00.000Z';
  const signingInput = signingInputForBundle({ address, payload, timestamp });
  const sig = nodeSign(null, Buffer.from(signingInput, 'utf8'), authorKey.privateKeyObject);
  const bundle: SignedBundle = {
    address,
    payload,
    timestamp,
    signature: sig.toString('base64'),
    public_key: Buffer.from(authorKey.publicKey).toString('base64'),
    key_id: 'placeholder',
  };
  return bundle;
}

describe('submitReview / fetchReview', () => {
  let bundleStore: InMemoryMarketplaceStore;
  let authorDir: InMemoryKeyDirectory;
  let reviewStore: InMemoryReviewStore;
  let reviewerDir: InMemoryReviewerKeyDirectory;
  let authorKey: RawKey;
  let reviewerKey: RawKey;
  let client: VaultClient;

  beforeEach(async () => {
    bundleStore = new InMemoryMarketplaceStore();
    authorDir = new InMemoryKeyDirectory();
    reviewStore = new InMemoryReviewStore();
    reviewerDir = new InMemoryReviewerKeyDirectory();
    authorKey = makeRawKey();
    reviewerKey = makeRawKey();
    authorDir.register('acme', authorKey.publicKey);
    reviewerDir.register('maint-a', reviewerKey.publicKey);
    // Compute author key_id properly so the publish 201s.
    const keyId = await computeMarketplaceKeyId(authorKey.publicKey);
    const bundle = publishBundle(bundleStore, authorDir, reviewStore, authorKey);
    bundle.key_id = keyId;
    bundleStore.put(bundle.address, bundle);
    // Seed a pending record (would be auto-created on real publish).
    reviewStore.put({
      address: bundle.address,
      state: 'pending',
      submitted_at: bundle.timestamp,
    });
    client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'test.app',
      fetcher: makeReviewFetcher(
        bundleStore,
        authorDir,
        reviewStore,
        reviewerDir,
        () => '2026-05-03T08:00:00.000Z',
      ),
    });
  });

  it('submitReview: signs + persists a state transition', async () => {
    const out = await submitReview(client, 'atelier://acme/email-triage@1.0.0', {
      state: 'approved',
      notes: 'LGTM',
      reviewerId: 'maint-a',
      privateKey: reviewerKey.privateKey,
    });
    expect(out.state).toBe('approved');
    expect(out.notes).toBe('LGTM');
    expect(out.reviewer_id).toBe('maint-a');
    expect(out.reviewed_at).toBe('2026-05-03T08:00:00.000Z');
    // submitted_at preserved from the initial publish.
    expect(out.submitted_at).toBe('2026-05-02T12:00:00.000Z');
    // Persisted server-side.
    const persisted = reviewStore.get(out.address);
    expect(persisted?.state).toBe('approved');
  });

  it('submitReview: throws MarketplaceError with `401` on unknown reviewer', async () => {
    let caught: unknown;
    try {
      await submitReview(client, 'atelier://acme/email-triage@1.0.0', {
        state: 'approved',
        reviewerId: 'maint-unregistered',
        privateKey: reviewerKey.privateKey,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MarketplaceError);
    expect((caught as MarketplaceError).message).toMatch(/401/);
  });

  it('submitReview: throws MarketplaceError with `404` when bundle is missing', async () => {
    let caught: unknown;
    try {
      await submitReview(client, 'atelier://acme/missing@9.9.9', {
        state: 'approved',
        reviewerId: 'maint-a',
        privateKey: reviewerKey.privateKey,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MarketplaceError);
    expect((caught as MarketplaceError).message).toMatch(/404/);
  });

  it('submitReview: rejects a malformed address', async () => {
    await expect(
      submitReview(client, 'not-an-atelier-uri', {
        state: 'approved',
        reviewerId: 'maint-a',
        privateKey: reviewerKey.privateKey,
      }),
    ).rejects.toBeInstanceOf(MarketplaceError);
  });

  it('fetchReview: returns null on 404', async () => {
    const out = await fetchReview(client, 'atelier://acme/missing@9.9.9');
    expect(out).toBeNull();
  });

  it('fetchReview: returns the persisted record', async () => {
    await submitReview(client, 'atelier://acme/email-triage@1.0.0', {
      state: 'flagged',
      reviewerId: 'maint-a',
      privateKey: reviewerKey.privateKey,
    });
    const out = await fetchReview(client, 'atelier://acme/email-triage@1.0.0');
    expect(out?.state).toBe('flagged');
  });
});

describe('listMarketplace', () => {
  let bundleStore: InMemoryMarketplaceStore;
  let authorDir: InMemoryKeyDirectory;
  let reviewStore: InMemoryReviewStore;
  let reviewerDir: InMemoryReviewerKeyDirectory;
  let client: VaultClient;

  beforeEach(async () => {
    bundleStore = new InMemoryMarketplaceStore();
    authorDir = new InMemoryKeyDirectory();
    reviewStore = new InMemoryReviewStore();
    reviewerDir = new InMemoryReviewerKeyDirectory();
    const authorKey = makeRawKey();
    authorDir.register('acme', authorKey.publicKey);
    const keyId = await computeMarketplaceKeyId(authorKey.publicKey);

    const seed = (version: string, state: ReviewState): void => {
      const bundle = publishBundle(bundleStore, authorDir, reviewStore, authorKey, version);
      bundle.key_id = keyId;
      bundleStore.put(bundle.address, bundle);
      reviewStore.put({
        address: bundle.address,
        state,
        submitted_at: bundle.timestamp,
      });
    };
    seed('1.0.0', 'approved');
    seed('2.0.0', 'pending');
    seed('3.0.0', 'rejected');

    client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'test.app',
      fetcher: makeReviewFetcher(bundleStore, authorDir, reviewStore, reviewerDir),
    });
  });

  it('default: returns approved-only listings', async () => {
    const out = await listMarketplace(client);
    expect(out.length).toBe(1);
    expect(out[0]?.address.version).toBe('1.0.0');
    expect(out[0]?.reviewState).toBe('approved');
  });

  it('include=pending,approved returns both', async () => {
    const out = await listMarketplace(client, { include: ['pending', 'approved'] });
    expect(out.length).toBe(2);
    const states = out.map((l) => l.reviewState).sort();
    expect(states).toEqual(['approved', 'pending']);
  });

  it('honours filter params', async () => {
    const out = await listMarketplace(client, { author: 'acme' });
    expect(out.length).toBe(1);
    const empty = await listMarketplace(client, { author: 'no-such' });
    expect(empty.length).toBe(0);
  });
});
