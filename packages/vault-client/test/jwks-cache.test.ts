// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { buildJwks, loadOrGenerateKeyPair, signJwt, type JwtClaims } from '@cir/vault-server';
import { JwksCache, decodeJwt } from '../src/jwks-cache.js';
import { VaultUnreachableError } from '../src/errors.js';

const NOW = 1_700_000_000;

function freshClaims(overrides: Partial<JwtClaims> = {}): JwtClaims {
  return {
    iss: 'vault-test',
    aud: 'cir.demo',
    sub: 'demo-user',
    scope: 'lens.today',
    iat: NOW,
    exp: NOW + 3600,
    jti: 'g_jwks_test',
    ...overrides,
  };
}

describe('decodeJwt', () => {
  it('decodes a valid token', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const token = signJwt(freshClaims(), pair);
    const decoded = decodeJwt(token);
    expect(decoded.header.alg).toBe('EdDSA');
    expect(decoded.claims.aud).toBe('cir.demo');
    expect(decoded.signatureBytes).toBeInstanceOf(Uint8Array);
  });

  it('rejects a token with the wrong number of segments', () => {
    expect(() => decodeJwt('only.two')).toThrow(/three segments/);
  });
});

describe('JwksCache', () => {
  it('verifies a signature against a fetched JWKS', async () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const jwks = buildJwks([pair]);
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const cache = new JwksCache({ vaultUrl: 'http://vault.test', fetcher, now: () => NOW * 1000 });
    const token = signJwt(freshClaims(), pair);
    const decoded = decodeJwt(token);
    const ok = await cache.verify(pair.kid, decoded.signingInput, decoded.signatureBytes);
    expect(ok).toBe(true);
  });

  it('throws VaultUnreachableError when fetch fails AND cache is empty', async () => {
    const fetcher: typeof fetch = () => Promise.reject(new Error('ECONNREFUSED'));
    const cache = new JwksCache({ vaultUrl: 'http://vault.test', fetcher, now: () => NOW * 1000 });
    await expect(cache.refresh()).rejects.toBeInstanceOf(VaultUnreachableError);
  });

  it('returns false when verifying with an unknown kid', async () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const jwks = buildJwks([pair]);
    const fetcher: typeof fetch = () =>
      Promise.resolve(new Response(JSON.stringify(jwks), { status: 200 }));
    const cache = new JwksCache({ vaultUrl: 'http://vault.test', fetcher, now: () => NOW * 1000 });
    const token = signJwt(freshClaims(), pair);
    const decoded = decodeJwt(token);
    const ok = await cache.verify('unknown-kid', decoded.signingInput, decoded.signatureBytes);
    expect(ok).toBe(false);
  });
});
