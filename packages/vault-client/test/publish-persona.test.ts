// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for V-6.f — `publishPersona` sign-at-publish helper.
 *
 * Drives an in-memory `MarketplaceStore` + `KeyDirectory` from
 * `@atelier/vault-server` over a stub fetcher to do an end-to-end
 * publish + consume round-trip and verify byte-equality.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

import {
  InMemoryKeyDirectory,
  InMemoryMarketplaceStore,
  MARKETPLACE_PREFIX,
  handleMarketplacePersonaRequest,
  type KeyDirectory,
  type MarketplaceStore,
} from '@atelier/vault-server';

import { SignedBundleSchema, type SignedBundle } from '@atelier/schemas';

import {
  MarketplaceError,
  VaultClient,
  publishPersona,
  type BundlePayload,
  type MarketplaceAuthor,
} from '../src/index.js';

/**
 * Build a fetcher that routes both `/marketplace/persona` and the
 * legacy `/vault/marketplace/...` endpoints through the in-memory
 * marketplace handler. We only wire the persona handler here because
 * `publishPersona` only ever hits that route.
 */
function makeFetcher(store: MarketplaceStore, directory: KeyDirectory): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
    const out = await handleMarketplacePersonaRequest(store, directory, {
      method,
      path: url.pathname,
      query: {},
      headers: {},
      body,
    });
    if (out === null) {
      return new Response(null, { status: 404 });
    }
    if (out.body === undefined) {
      return new Response(null, { status: out.status });
    }
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

/** Generate raw 32-byte ed25519 keypair material via node:crypto. */
function makeAuthorKey(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const privateRaw = new Uint8Array(pkcs8.subarray(pkcs8.length - 32));
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const publicRaw = new Uint8Array(spki.subarray(spki.length - 32));
  return { privateKey: privateRaw, publicKey: publicRaw };
}

describe('publishPersona', () => {
  let store: InMemoryMarketplaceStore;
  let directory: InMemoryKeyDirectory;
  let client: VaultClient;
  let key: { privateKey: Uint8Array; publicKey: Uint8Array };

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    directory = new InMemoryKeyDirectory();
    key = makeAuthorKey();
    directory.register('acme', key.publicKey);
    client = new VaultClient({
      vaultUrl: 'http://vault.local',
      appId: 'test.app',
      fetcher: makeFetcher(store, directory),
    });
  });

  it('publishes a bundle and the server stores it byte-for-byte', async () => {
    const bundle: BundlePayload = {
      address: 'atelier://acme/founder-inbox@1.0.0',
      payload: { recipe: 'inbox-zero', skills: ['triage', 'extract'] },
      timestamp: '2026-05-02T12:00:00.000Z',
    };
    const author: MarketplaceAuthor = { id: 'acme', privateKey: key.privateKey };

    const out = await publishPersona(client, bundle, author);
    expect(out).toMatchObject({
      scheme: 'atelier',
      author: 'acme',
      persona: 'founder-inbox',
      version: '1.0.0',
    });

    // The server stored the same bundle bytes that publishPersona POSTed.
    const stored = store.get(out);
    expect(stored).toBeDefined();
    expect(stored?.payload).toEqual(bundle.payload);
    // Round-trip the stored bundle through the schema to confirm shape.
    const parsed = SignedBundleSchema.parse(stored);
    expect(parsed.address.author).toBe('acme');
  });

  it('publish + consume round-trip yields byte-equal bundle', async () => {
    const bundle: BundlePayload = {
      address: 'atelier://acme/recipe@2.0.0',
      payload: { hello: 'world', n: 42 },
      timestamp: '2026-05-02T13:00:00.000Z',
    };
    const author: MarketplaceAuthor = { id: 'acme', privateKey: key.privateKey };
    await publishPersona(client, bundle, author);

    // Drive the fetcher directly to GET the bundle back.
    const fetcher = makeFetcher(store, directory);
    const res = await fetcher(`http://vault.local${MARKETPLACE_PREFIX}/acme/recipe@2.0.0`);
    expect(res.status).toBe(200);
    const consumed = (await res.json()) as SignedBundle;
    expect(consumed.payload).toEqual(bundle.payload);
    expect(consumed.timestamp).toBe(bundle.timestamp);
  });

  it('rejects an address whose author does not match author.id', async () => {
    const bundle: BundlePayload = {
      address: 'atelier://acme/recipe@1.0.0',
      payload: {},
    };
    const author: MarketplaceAuthor = { id: 'evil-bob', privateKey: key.privateKey };
    await expect(publishPersona(client, bundle, author)).rejects.toBeInstanceOf(MarketplaceError);
  });

  it('throws MarketplaceError with `401` on a bad key (unknown author)', async () => {
    // Wipe the directory entry so the server 401s.
    directory.remove('acme');
    const bundle: BundlePayload = {
      address: 'atelier://acme/recipe@1.0.0',
      payload: {},
    };
    const author: MarketplaceAuthor = { id: 'acme', privateKey: key.privateKey };
    let caught: unknown;
    try {
      await publishPersona(client, bundle, author);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MarketplaceError);
    expect((caught as MarketplaceError).message).toMatch(/401/);
  });

  it('throws MarketplaceError with `409` on duplicate publish', async () => {
    const bundle: BundlePayload = {
      address: 'atelier://acme/recipe@1.0.0',
      payload: {},
      timestamp: '2026-05-02T12:00:00.000Z',
    };
    const author: MarketplaceAuthor = { id: 'acme', privateKey: key.privateKey };
    await publishPersona(client, bundle, author);
    let caught: unknown;
    try {
      await publishPersona(client, bundle, author);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MarketplaceError);
    expect((caught as MarketplaceError).message).toMatch(/409/);
  });

  it('rejects a malformed address', async () => {
    const bundle: BundlePayload = {
      address: 'not-an-atelier-uri',
      payload: {},
    };
    const author: MarketplaceAuthor = { id: 'acme', privateKey: key.privateKey };
    await expect(publishPersona(client, bundle, author)).rejects.toBeInstanceOf(MarketplaceError);
  });

  it('rejects a 31-byte private key with a clear error', async () => {
    const bundle: BundlePayload = {
      address: 'atelier://acme/recipe@1.0.0',
      payload: {},
    };
    const author: MarketplaceAuthor = {
      id: 'acme',
      privateKey: new Uint8Array(31), // wrong length
    };
    await expect(publishPersona(client, bundle, author)).rejects.toThrow(/32 raw bytes/);
  });

  it('accepts an explicit publicKey, skipping derivation', async () => {
    const bundle: BundlePayload = {
      address: 'atelier://acme/explicit@1.0.0',
      payload: { ok: true },
    };
    const author: MarketplaceAuthor = {
      id: 'acme',
      privateKey: key.privateKey,
      publicKey: key.publicKey,
    };
    const out = await publishPersona(client, bundle, author);
    expect(out.persona).toBe('explicit');
  });
});
