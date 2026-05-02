// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import {
  MemoryMarketplaceStorage,
  MemoryVaultStorage,
  VaultService,
  computeKeyId,
  handleMarketplaceRequest,
  handleVaultRequest,
  loadOrGenerateKeyPair,
  parseFetchPath,
  verifyBundleSignature,
  type VaultRequest,
} from '../src/index.js';
import {
  formatMarketplaceAddress,
  parseMarketplaceAddress,
  signingInputForBundle,
  type MarketplaceAddress,
  type SignedBundle,
} from '@atelier/schemas';

/** Build a fresh ed25519 keypair + matching SignedBundle. */
function makeBundle(opts?: {
  address?: MarketplaceAddress;
  payload?: unknown;
  timestamp?: string;
  /** Sign with a different key than the embedded public_key; for tampering tests. */
  tamperSignature?: boolean;
}): {
  bundle: SignedBundle;
  publicKeyRaw: Buffer;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const publicKeyRaw = der.subarray(der.length - 32);
  const address: MarketplaceAddress =
    opts?.address ?? parseMarketplaceAddress('atelier://acme/email-triage@1.0.0')!;
  const payload = opts?.payload ?? { recipe: 'inbox-zero' };
  const timestamp = opts?.timestamp ?? '2026-05-02T12:00:00.000Z';
  const signingInput = signingInputForBundle({ address, payload, timestamp });
  const sigBuf = opts?.tamperSignature
    ? nodeSign(null, Buffer.from('tampered', 'utf8'), privateKey)
    : nodeSign(null, Buffer.from(signingInput, 'utf8'), privateKey);
  const bundle: SignedBundle = {
    address,
    payload,
    timestamp,
    signature: sigBuf.toString('base64'),
    public_key: publicKeyRaw.toString('base64'),
    key_id: computeKeyId(publicKeyRaw),
  };
  return { bundle, publicKeyRaw, privateKey };
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

describe('parseFetchPath', () => {
  it('parses a canonical fetch path', () => {
    const out = parseFetchPath('/vault/marketplace/acme/recipe@1.0.0');
    expect(out).toEqual({
      scheme: 'atelier',
      author: 'acme',
      persona: 'recipe',
      version: '1.0.0',
    });
  });

  it('returns null for the publish path', () => {
    expect(parseFetchPath('/vault/marketplace/publish')).toBeNull();
  });

  it('returns null on a missing version', () => {
    expect(parseFetchPath('/vault/marketplace/acme/recipe')).toBeNull();
  });
});

describe('verifyBundleSignature', () => {
  it('accepts a freshly-signed bundle', () => {
    const { bundle } = makeBundle();
    expect(verifyBundleSignature(bundle)).toEqual({ ok: true });
  });

  it('rejects a tampered signature', () => {
    const { bundle } = makeBundle({ tamperSignature: true });
    const result = verifyBundleSignature(bundle);
    expect(result.ok).toBe(false);
  });

  it('rejects a payload mutated after signing', () => {
    const { bundle } = makeBundle();
    const mutated: SignedBundle = { ...bundle, payload: { recipe: 'replaced' } };
    const result = verifyBundleSignature(mutated);
    expect(result.ok).toBe(false);
  });

  it('rejects a key_id that does not match public_key', () => {
    const { bundle } = makeBundle();
    const tampered: SignedBundle = { ...bundle, key_id: '0123456789abcdef' };
    const result = verifyBundleSignature(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/key_id/);
  });
});

describe('handleMarketplaceRequest — publish', () => {
  it('stores a valid bundle and returns 201', () => {
    const storage = new MemoryMarketplaceStorage();
    const { bundle } = makeBundle();
    const res = handleMarketplaceRequest(
      storage,
      req({ method: 'POST', path: '/vault/marketplace/publish', body: bundle }),
    );
    expect(res?.status).toBe(201);
    expect(storage.get(bundle.address)).toEqual(bundle);
  });

  it('rejects a malformed body with 400', () => {
    const storage = new MemoryMarketplaceStorage();
    const res = handleMarketplaceRequest(
      storage,
      req({ method: 'POST', path: '/vault/marketplace/publish', body: { not: 'a bundle' } }),
    );
    expect(res?.status).toBe(400);
  });

  it('rejects a tampered bundle with 400', () => {
    const storage = new MemoryMarketplaceStorage();
    const { bundle } = makeBundle({ tamperSignature: true });
    const res = handleMarketplaceRequest(
      storage,
      req({ method: 'POST', path: '/vault/marketplace/publish', body: bundle }),
    );
    expect(res?.status).toBe(400);
    expect(res?.body).toMatchObject({ error: 'signature verification failed' });
  });
});

describe('handleMarketplaceRequest — fetch', () => {
  it('returns the stored bundle verbatim', () => {
    const storage = new MemoryMarketplaceStorage();
    const { bundle } = makeBundle();
    storage.put(bundle.address, bundle);
    const res = handleMarketplaceRequest(
      storage,
      req({
        method: 'GET',
        path: `/vault/marketplace/${bundle.address.author}/${bundle.address.persona}@${bundle.address.version}`,
      }),
    );
    expect(res?.status).toBe(200);
    expect(res?.body).toEqual(bundle);
  });

  it('returns 404 for an unknown address', () => {
    const storage = new MemoryMarketplaceStorage();
    const res = handleMarketplaceRequest(
      storage,
      req({ method: 'GET', path: '/vault/marketplace/acme/recipe@9.9.9' }),
    );
    expect(res?.status).toBe(404);
  });

  it('returns 400 on a malformed path', () => {
    const storage = new MemoryMarketplaceStorage();
    const res = handleMarketplaceRequest(
      storage,
      req({ method: 'GET', path: '/vault/marketplace/acme/recipe' }),
    );
    expect(res?.status).toBe(400);
  });
});

describe('handleMarketplaceRequest — round-trip via VaultService', () => {
  it('publish → fetch returns the same bundle', async () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const svc = new VaultService({
      storage: new MemoryVaultStorage(),
      key: pair,
      issuer: 'vault-test',
    });
    const { bundle } = makeBundle();
    const publishRes = await handleVaultRequest(
      svc,
      req({ method: 'POST', path: '/vault/marketplace/publish', body: bundle }),
    );
    expect(publishRes.status).toBe(201);

    const fetchRes = await handleVaultRequest(
      svc,
      req({
        method: 'GET',
        path: `/vault/marketplace/${bundle.address.author}/${bundle.address.persona}@${bundle.address.version}`,
      }),
    );
    expect(fetchRes.status).toBe(200);
    const out = fetchRes.body as SignedBundle;
    expect(out.signature).toBe(bundle.signature);
    expect(out.public_key).toBe(bundle.public_key);
    expect(verifyBundleSignature(out)).toEqual({ ok: true });
  });

  it('routes the publish path past the JWKS handler', async () => {
    // Smoke-check that the dispatcher doesn't accidentally swallow the path
    // with another route. JWKS is also a GET on /.well-known/jwks.json so
    // the order of the marketplace handler vs the JWKS check matters; this
    // confirms the wiring.
    const { pair } = loadOrGenerateKeyPair(undefined);
    const svc = new VaultService({
      storage: new MemoryVaultStorage(),
      key: pair,
      issuer: 'vault-test',
    });
    const fetchUnknown = await handleVaultRequest(
      svc,
      req({ method: 'GET', path: '/vault/marketplace/acme/recipe@1.0.0' }),
    );
    expect(fetchUnknown.status).toBe(404);
    expect(fetchUnknown.body).toMatchObject({ error: 'bundle not found' });
  });
});

describe('formatMarketplaceAddress in storage key', () => {
  it('treats addresses with and without signed_by as the same key', () => {
    const storage = new MemoryMarketplaceStorage();
    const { bundle } = makeBundle();
    storage.put(bundle.address, bundle);
    const pinned: MarketplaceAddress = {
      ...bundle.address,
      signed_by: '0123456789abcdef',
    };
    expect(storage.get(pinned)).toEqual(bundle);
    // Sanity: the format helper preserves signed_by separately.
    expect(formatMarketplaceAddress(pinned)).toContain('?signed_by=');
  });
});
