// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Marketplace integration smoke (Wave 8 / V-6).
 *
 * Drives an in-process publish → fetch → verify round trip against the
 * real `@cir/vault-server` marketplace handler + the real
 * `@cir/vault-client` `MarketplaceClient`. No sockets, no env-flag gating
 * at the test layer — the test owns its own tiny vault service.
 *
 * The demo's runtime gating (`CIR_MARKETPLACE_ENABLED=1`) is independent
 * of this smoke; this test simply asserts the ergonomics work end-to-end
 * so a follow-up that wires the demo's UI has a known-good baseline.
 */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { MemoryMarketplaceStorage, handleMarketplaceRequest } from '@cir/vault-server';
import {
  InMemoryTrustedKeyStore,
  MarketplaceClient,
  type MarketplaceKeyMaterial,
} from '@cir/vault-client';

function makeKeypair(): MarketplaceKeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const privateRaw = new Uint8Array(pkcs8.subarray(pkcs8.length - 32));
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const publicRaw = new Uint8Array(spki.subarray(spki.length - 32));
  return { privateKey: privateRaw, publicKey: publicRaw };
}

describe('marketplace smoke — end-to-end', () => {
  it('a demo recipe can be published + fetched + verified', async () => {
    const storage = new MemoryMarketplaceStorage();
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const out = handleMarketplaceRequest(storage, {
        method: (init?.method ?? 'GET').toUpperCase(),
        path: url.pathname,
        query: {},
        headers: {},
        body: typeof init?.body === 'string' && init.body.length > 0 ? JSON.parse(init.body) : null,
      });
      if (out === null) return new Response(null, { status: 404 });
      return new Response(out.body !== undefined ? JSON.stringify(out.body) : null, {
        status: out.status,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = new MarketplaceClient({
      vaultUrl: 'http://vault.local',
      fetcher,
      trustedKeys: new InMemoryTrustedKeyStore(),
    });

    const key = makeKeypair();
    const recipe = {
      id: 'aurora-email-triage',
      version: '1.0.0',
      lenses: ['today'],
      trust: 'ask-once',
    };
    const published = await client.publish('cir://aurora-labs/email-triage@1.0.0', recipe, key);
    expect(published.address).toBe('cir://aurora-labs/email-triage@1.0.0');

    const fetched = await client.fetch('cir://aurora-labs/email-triage@1.0.0');
    expect(fetched).toEqual(recipe);
  });
});
