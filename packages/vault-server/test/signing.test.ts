// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  b64uDecode,
  b64uEncode,
  buildJwks,
  deriveKid,
  exportPrivatePem,
  loadOrGenerateKeyPair,
  signJwt,
  verifyJwt,
  type JwtClaims,
} from '../src/signing.js';

const NOW = 1_700_000_000;

function freshClaims(overrides: Partial<JwtClaims> = {}): JwtClaims {
  return {
    iss: 'vault-test',
    aud: 'cir.demo',
    sub: 'demo-user',
    scope: 'lens.today vocabulary.read',
    iat: NOW,
    exp: NOW + 3600,
    jti: 'g_test',
    ...overrides,
  };
}

describe('signing — base64url', () => {
  it('round-trips a buffer', () => {
    const text = 'hello world';
    expect(b64uDecode(b64uEncode(text)).toString('utf8')).toBe(text);
  });

  it('rejects non-base64url characters', () => {
    expect(() => b64uDecode('not valid!')).toThrow(/invalid base64url/);
  });
});

describe('signing — keypair', () => {
  it('generates an ephemeral pair when no PEM is given', () => {
    const { pair, generated } = loadOrGenerateKeyPair(undefined);
    expect(generated).toBe(true);
    expect(pair.kid).toMatch(/^vault-/);
    expect(pair.privateKey.asymmetricKeyType).toBe('ed25519');
  });

  it('reuses a provided PEM', () => {
    const a = loadOrGenerateKeyPair(undefined);
    const pem = exportPrivatePem(a.pair);
    const b = loadOrGenerateKeyPair(pem);
    expect(b.generated).toBe(false);
    expect(b.pair.kid).toBe(a.pair.kid);
  });

  it('rejects a non-ed25519 key', async () => {
    // Generate an RSA pair via node:crypto, export to PEM, and verify rejection.
    // We use the same loader path so the error message is informative.
    const { generateKeyPairSync } = await import('node:crypto');
    const rsa = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(() => loadOrGenerateKeyPair(rsa.privateKey as string)).toThrow(/ed25519/);
  });
});

describe('signing — JWT', () => {
  it('round-trips claims through sign + verify', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const token = signJwt(freshClaims(), pair);
    const verified = verifyJwt(token, pair.publicKey, NOW + 60);
    expect(verified.claims.aud).toBe('cir.demo');
    expect(verified.claims.scope).toBe('lens.today vocabulary.read');
    expect(verified.header.kid).toBe(pair.kid);
  });

  it('rejects an expired token', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const token = signJwt(freshClaims({ exp: NOW - 1 }), pair);
    expect(() => verifyJwt(token, pair.publicKey, NOW)).toThrow(/expired/);
  });

  it('rejects a token with a tampered payload', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const token = signJwt(freshClaims(), pair);
    const [h, , s] = token.split('.');
    // Tamper the payload by replacing it with a re-encoded altered claim set.
    const altered = b64uEncode(JSON.stringify(freshClaims({ scope: 'vault.admin' })));
    const tampered = `${h ?? ''}.${altered}.${s ?? ''}`;
    expect(() => verifyJwt(tampered, pair.publicKey, NOW)).toThrow(/bad signature/);
  });

  it('rejects a malformed token', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    expect(() => verifyJwt('not.a.valid.jwt', pair.publicKey, NOW)).toThrow(/malformed/);
    expect(() => verifyJwt('only_two.parts', pair.publicKey, NOW)).toThrow(/malformed/);
    // Three segments but garbage header JSON.
    expect(() => verifyJwt('Z.Z.Z', pair.publicKey, NOW)).toThrow();
  });

  it('rejects a header with the wrong alg', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const evilHeader = b64uEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const evilPayload = b64uEncode(JSON.stringify(freshClaims()));
    const evilToken = `${evilHeader}.${evilPayload}.AA`;
    expect(() => verifyJwt(evilToken, pair.publicKey, NOW)).toThrow(/unsupported header/);
  });
});

describe('signing — JWKS', () => {
  it('emits a valid JWKS document with the right shape', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    const jwks = buildJwks([pair]);
    expect(jwks.keys).toHaveLength(1);
    const k = jwks.keys[0];
    expect(k).toBeDefined();
    if (!k) return;
    expect(k.kty).toBe('OKP');
    expect(k.crv).toBe('Ed25519');
    expect(k.alg).toBe('EdDSA');
    expect(k.use).toBe('sig');
    expect(k.kid).toBe(pair.kid);
    // Raw ed25519 public is 32 bytes -> base64url is 43 chars (no padding).
    expect(k.x.length).toBe(43);
  });

  it('derives the same kid for the same key', () => {
    const { pair } = loadOrGenerateKeyPair(undefined);
    expect(deriveKid(pair.publicKey)).toBe(pair.kid);
  });
});
