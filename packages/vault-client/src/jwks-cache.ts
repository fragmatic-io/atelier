// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * JWKS cache + Web Crypto-based ed25519 verifier.
 *
 * Both Node 22 and modern browsers expose `globalThis.crypto.subtle` with
 * support for `Ed25519`. We use that single API so the same client runs
 * server-side (Node), in the browser, and in tests (vitest) without a
 * polyfill.
 *
 * The cache fetches `/.well-known/jwks.json` once and re-fetches when the
 * TTL elapses (default 5 min). A failed re-fetch falls back to the cached
 * keys so transient vault outages don't break verification.
 */

import { VaultUnreachableError } from './errors.js';

interface JwksResponseKey {
  kty: 'OKP';
  crv: 'Ed25519';
  alg: 'EdDSA';
  use?: 'sig';
  kid: string;
  /** RFC 8037 raw 32-byte Ed25519 public key, base64url-encoded. */
  x: string;
}

interface JwksResponse {
  keys: JwksResponseKey[];
}

/** A cached, ready-to-verify CryptoKey. */
interface CachedKey {
  kid: string;
  cryptoKey: CryptoKey;
  /** Unix ms when this cache was filled. */
  fetched_at: number;
}

export interface JwksCacheOptions {
  /** Vault base URL (e.g. `http://localhost:4001`). The cache appends `/.well-known/jwks.json`. */
  vaultUrl: string;
  /** Override the fetcher (tests pass a stub). */
  fetcher?: typeof fetch;
  /** Override the clock. Default: `() => Date.now()`. */
  now?: () => number;
  /** TTL in ms before we re-fetch JWKS. Default: 5 min. */
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Decode a base64url string into a fresh ArrayBuffer-backed Uint8Array.
 * Tiny — duplicated rather than depending on vault-server. Returning a
 * Uint8Array with an ArrayBuffer (not SharedArrayBuffer) means the result
 * satisfies Web Crypto's `BufferSource` constraint without further copies.
 */
function b64uToBytes(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new Error('invalid base64url');
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  let bytes: Uint8Array;
  if (typeof atob === 'function') {
    const bin = atob(base64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  } else {
    // Node fallback (Node 18+ has atob, but be defensive).
    bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  }
  // Re-allocate into a fresh ArrayBuffer so callers always get a buffer of
  // type ArrayBuffer (not SharedArrayBuffer). Web Crypto's importKey/verify
  // typings reject the latter under TypeScript 5+.
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

/**
 * Fetch + cache the vault's JWKS. Verifies ed25519 signatures against the
 * cached keys; re-fetches on TTL expiry; falls back to last-known-good on
 * a network error.
 */
export class JwksCache {
  private readonly vaultUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private keys: Map<string, CachedKey> = new Map();
  private lastFetchedAt = 0;

  constructor(opts: JwksCacheOptions) {
    this.vaultUrl = opts.vaultUrl.replace(/\/+$/, '');
    this.fetcher = opts.fetcher ?? fetch;
    this.now = opts.now ?? (() => Date.now());
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Force a re-fetch (caller can call after a known rotation event).
   * Throws `VaultUnreachableError` if the network is down AND the cache is empty.
   */
  async refresh(): Promise<void> {
    let body: JwksResponse;
    try {
      const res = await this.fetcher(`${this.vaultUrl}/.well-known/jwks.json`);
      if (!res.ok) {
        throw new Error(`JWKS fetch returned HTTP ${String(res.status)}`);
      }
      body = (await res.json()) as JwksResponse;
    } catch (err) {
      if (this.keys.size === 0) {
        throw new VaultUnreachableError(err as Error);
      }
      // Keep the stale cache; next `verify` will use it.
      return;
    }
    const next = new Map<string, CachedKey>();
    for (const k of body.keys) {
      // Only OKP/Ed25519 keys are accepted. Anything else is silently
      // dropped — a future rotation to a different alg would need a client
      // upgrade.
      if (k.kty !== 'OKP' || k.crv !== 'Ed25519') continue;
      const raw = toArrayBuffer(b64uToBytes(k.x));
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'Ed25519' },
        false,
        ['verify'],
      );
      next.set(k.kid, { kid: k.kid, cryptoKey, fetched_at: this.now() });
    }
    if (next.size > 0) {
      this.keys = next;
      this.lastFetchedAt = this.now();
    }
  }

  /** Look up the cached key for a `kid`; refreshes the cache on miss. */
  async getKey(kid: string): Promise<CryptoKey | undefined> {
    const stale = this.now() - this.lastFetchedAt > this.ttlMs;
    if (this.keys.size === 0 || stale || !this.keys.has(kid)) {
      await this.refresh();
    }
    return this.keys.get(kid)?.cryptoKey;
  }

  /** Verify an ed25519 signature over `signingInput`. */
  async verify(kid: string, signingInput: string, signature: Uint8Array): Promise<boolean> {
    const key = await this.getKey(kid);
    if (key === undefined) return false;
    const data = toArrayBuffer(new TextEncoder().encode(signingInput));
    const sig = toArrayBuffer(signature);
    return globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, sig, data);
  }
}

/**
 * Coerce a Uint8Array (which may be backed by SharedArrayBuffer in some TS
 * 5+ inferences) into a fresh ArrayBuffer so Web Crypto typings accept it.
 * Allocates a new buffer; for the small payloads JWKS / JWT verification
 * deals with this is cheap.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/** Decode the unverified claims of a JWT for local-only checks (e.g. exp). */
export interface DecodedJwt {
  header: { alg?: string; typ?: string; kid?: string };
  claims: {
    iss?: string;
    aud?: string;
    sub?: string;
    scope?: string;
    exp?: number;
    iat?: number;
    jti?: string;
  };
  signingInput: string;
  signatureBytes: Uint8Array;
}

/**
 * Pure JWT decode. Does NOT verify — `JwksCache.verify` handles that.
 * Throws on malformed input; the caller maps to `VaultUnauthorizedError`.
 */
export function decodeJwt(token: string): DecodedJwt {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('malformed token: expected three segments');
  const [headerSeg, payloadSeg, sigSeg] = segments as [string, string, string];
  const header = JSON.parse(
    new TextDecoder().decode(b64uToBytes(headerSeg)),
  ) as DecodedJwt['header'];
  const claims = JSON.parse(
    new TextDecoder().decode(b64uToBytes(payloadSeg)),
  ) as DecodedJwt['claims'];
  return {
    header,
    claims,
    signingInput: `${headerSeg}.${payloadSeg}`,
    signatureBytes: b64uToBytes(sigSeg),
  };
}
