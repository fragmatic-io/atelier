// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * ed25519 sign + verify, plus a hand-rolled JWT encoder/decoder.
 *
 * Why hand-rolled: the brief explicitly forbids "fancy crypto libs" and asks
 * for `header.payload.signature` base64url JWTs over Node's built-in `crypto`.
 * The format is RFC 7515 compact JWS with `alg: EdDSA`. ed25519 is a tiny
 * algorithm — one signature, one verification, no padding, no parameters —
 * so the resulting code is short and auditable.
 *
 * Key persistence: `loadOrGenerateKeyPair()` reads PEM from
 * `VAULT_SIGNING_KEY_PEM`, or generates an ephemeral pair and prints a
 * warning. The `kid` is derived from the public key SPKI bytes so the same
 * key always produces the same `kid` (rotation detection becomes trivial).
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  createHash,
  type KeyObject,
} from 'node:crypto';

/** A loaded vault keypair plus its derived `kid`. */
export interface VaultKeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** Stable id derived from the public key bytes. */
  kid: string;
}

/** ed25519 SPKI public key bytes are 44 bytes; raw key is 32. */
const ED25519_RAW_PUBLIC_LEN = 32;

/** Base64url encode (RFC 7515 §2). No padding. */
export function b64uEncode(input: string | Uint8Array): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url decode to a Buffer. Reverses `b64uEncode`. Throws on invalid input. */
export function b64uDecode(input: string): Buffer {
  // Reject obviously-bad characters early so a malformed token doesn't silently
  // decode to garbage. Only the base64url alphabet is allowed.
  if (!/^[A-Za-z0-9_-]*$/.test(input)) {
    throw new Error('invalid base64url input');
  }
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** JOSE header for our hand-rolled JWTs. */
export interface JwtHeader {
  alg: 'EdDSA';
  typ: 'JWT';
  kid?: string;
}

/** Required JWT claims emitted by the vault. */
export interface JwtClaims {
  iss: string;
  aud: string;
  sub: string;
  scope: string;
  exp: number;
  iat: number;
  jti: string;
}

/**
 * Sign a JWT. Returns the compact `header.payload.signature` form. ed25519
 * signatures are deterministic — signing the same message twice produces the
 * same bytes, which makes the test fixtures stable.
 */
export function signJwt(claims: JwtClaims, key: VaultKeyPair): string {
  const header: JwtHeader = { alg: 'EdDSA', typ: 'JWT', kid: key.kid };
  const headerSegment = b64uEncode(JSON.stringify(header));
  const payloadSegment = b64uEncode(JSON.stringify(claims));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = nodeSign(null, Buffer.from(signingInput, 'utf8'), key.privateKey);
  const sigSegment = b64uEncode(signature);
  return `${signingInput}.${sigSegment}`;
}

/** Result of a successful JWT decode + verify. */
export interface VerifiedJwt {
  header: JwtHeader;
  claims: JwtClaims;
}

/**
 * Verify and decode a JWT. Throws with a concrete message on the first
 * failed check (malformed → bad signature → missing claim → expired). The
 * caller is expected to map these to HTTP 401.
 */
export function verifyJwt(token: string, publicKey: KeyObject, nowSeconds?: number): VerifiedJwt {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('malformed token: expected three segments');
  const [headerSeg, payloadSeg, sigSeg] = segments as [string, string, string];

  let header: JwtHeader;
  try {
    header = JSON.parse(b64uDecode(headerSeg).toString('utf8')) as JwtHeader;
  } catch {
    throw new Error('malformed token: header is not valid JSON');
  }
  if (header.alg !== 'EdDSA' || header.typ !== 'JWT') {
    throw new Error(`unsupported header: alg=${String(header.alg)} typ=${String(header.typ)}`);
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(b64uDecode(payloadSeg).toString('utf8')) as JwtClaims;
  } catch {
    throw new Error('malformed token: payload is not valid JSON');
  }

  // Verify the signature before any claim is trusted.
  const signingInput = `${headerSeg}.${payloadSeg}`;
  const ok = nodeVerify(null, Buffer.from(signingInput, 'utf8'), publicKey, b64uDecode(sigSeg));
  if (!ok) throw new Error('bad signature');

  // Only after the signature is confirmed do we look at the claims.
  for (const k of ['iss', 'aud', 'sub', 'scope', 'exp', 'iat', 'jti'] as const) {
    if (claims[k] === undefined || claims[k] === null) {
      throw new Error(`missing required claim: ${k}`);
    }
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    throw new Error('token expired');
  }
  return { header, claims };
}

/**
 * Compute a deterministic `kid` from the SPKI public-key bytes. Rotation
 * detection becomes trivial: two keys with the same `kid` are bit-identical;
 * a different `kid` means a rotation event.
 */
export function deriveKid(publicKey: KeyObject): string {
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const hash = createHash('sha256').update(der).digest();
  return `vault-${hash.toString('hex').slice(0, 12)}`;
}

/**
 * Load a vault keypair from PEM text, or generate a fresh ephemeral pair if
 * none is provided. The caller is expected to log a warning when the
 * generated branch fires — running on an ephemeral key invalidates every
 * outstanding token on each restart.
 */
export function loadOrGenerateKeyPair(pem?: string | null): {
  pair: VaultKeyPair;
  generated: boolean;
} {
  if (typeof pem === 'string' && pem.length > 0) {
    const privateKey = createPrivateKey({ key: pem, format: 'pem' });
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error(
        `VAULT_SIGNING_KEY_PEM must be an ed25519 private key (got ${String(privateKey.asymmetricKeyType)})`,
      );
    }
    const publicKey = createPublicKey(privateKey);
    return {
      pair: { privateKey, publicKey, kid: deriveKid(publicKey) },
      generated: false,
    };
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    pair: { privateKey, publicKey, kid: deriveKid(publicKey) },
    generated: true,
  };
}

/**
 * Build a JWKS document for the given public key(s). Public keys are
 * exported as raw 32-byte ed25519 points (after stripping the SPKI prefix)
 * and base64url-encoded into the `x` field per RFC 8037.
 */
export interface JwksKey {
  kty: 'OKP';
  crv: 'Ed25519';
  alg: 'EdDSA';
  use: 'sig';
  kid: string;
  x: string;
}

export interface JwksDocument {
  keys: JwksKey[];
}

/** Strip the 12-byte ASN.1 SPKI prefix from an ed25519 SPKI export. */
function rawPublicBytes(publicKey: KeyObject): Buffer {
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  // SPKI for ed25519 is 44 bytes total; the raw key is the last 32 bytes.
  if (der.length < ED25519_RAW_PUBLIC_LEN) throw new Error('SPKI export too short');
  return der.subarray(der.length - ED25519_RAW_PUBLIC_LEN);
}

export function buildJwks(pairs: readonly VaultKeyPair[]): JwksDocument {
  return {
    keys: pairs.map((p) => ({
      kty: 'OKP',
      crv: 'Ed25519',
      alg: 'EdDSA',
      use: 'sig',
      kid: p.kid,
      x: b64uEncode(rawPublicBytes(p.publicKey)),
    })),
  };
}

/**
 * Serialize a vault keypair to PEM (private key only). Useful for `cir vault
 * dev` to print a key the user can stash in `.env.local`.
 */
export function exportPrivatePem(pair: VaultKeyPair): string {
  const pem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' });
  return typeof pem === 'string' ? pem : pem.toString('utf8');
}
