// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Marketplace client — Wave 8 / V-6 (MVP).
 *
 * Pairs with `@cir/vault-server`'s `marketplace.ts` over the HTTP wire. Two
 * surfaces:
 *
 *   - `publish(address, payload, privateKey)` — sign + POST a bundle.
 *   - `fetch(address)` — GET, verify the signature locally, run TOFU,
 *                        return the parsed payload.
 *
 * TOFU (trust-on-first-use): the first fetch from each author records the
 * key fingerprint in the local `TrustedKeyStore`. Subsequent fetches must
 * present the SAME fingerprint or the client throws
 * `MarketplaceTrustError` with both the cached and the observed
 * fingerprints in scope. This is the same posture HTTPS host pinning
 * takes; no surprise rotations.
 *
 * Optional override: an address with `?signed_by=<key_id>` skips the TOFU
 * cache and pins to that fingerprint for that fetch only. If the bundle
 * doesn't match, it's a hard error — the publisher explicitly asked us to
 * verify against this key.
 */
import { VaultUnreachableError } from './errors.js';
import {
  SignedBundleSchema,
  formatMarketplaceAddress,
  parseMarketplaceAddress,
  signingInputForBundle,
  type MarketplaceAddress,
  type SignedBundle,
} from '@cir/schemas';

/**
 * Local TOFU cache. Authors map to the fingerprint we first saw them sign
 * with. Hosts may pass a custom store (e.g. one that persists to a file or
 * a server-side keyvault).
 */
export interface TrustedKeyStore {
  get(author: string): Promise<string | undefined> | string | undefined;
  set(author: string, keyId: string): Promise<void> | void;
  clear(author: string): Promise<void> | void;
}

/** Default in-memory implementation. Used in Node + tests. */
export class InMemoryTrustedKeyStore implements TrustedKeyStore {
  private map = new Map<string, string>();

  get(author: string): string | undefined {
    return this.map.get(author);
  }

  set(author: string, keyId: string): void {
    this.map.set(author, keyId);
  }

  clear(author: string): void {
    this.map.delete(author);
  }
}

/**
 * Browser localStorage-backed TOFU store. SSR-safe — every method falls
 * back to a no-op when `window` is undefined or `localStorage` access
 * throws (privacy modes, sandboxed iframes, etc.).
 */
export class LocalStorageTrustedKeyStore implements TrustedKeyStore {
  private readonly prefix: string;

  constructor(prefix = 'cir.marketplace.tofu.') {
    this.prefix = prefix;
  }

  private keyFor(author: string): string {
    return `${this.prefix}${author}`;
  }

  get(author: string): string | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
      const v = window.localStorage.getItem(this.keyFor(author));
      return v ?? undefined;
    } catch {
      return undefined;
    }
  }

  set(author: string, keyId: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(this.keyFor(author), keyId);
    } catch {
      /* quota exceeded / privacy mode — no-op */
    }
  }

  clear(author: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(this.keyFor(author));
    } catch {
      /* no-op */
    }
  }
}

/** Auto-pick a trusted-key store (browser → localStorage, Node → memory). */
export function defaultTrustedKeyStore(): TrustedKeyStore {
  if (typeof window !== 'undefined') return new LocalStorageTrustedKeyStore();
  return new InMemoryTrustedKeyStore();
}

/** Base class so callers can `instanceof MarketplaceError`. */
export class MarketplaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketplaceError';
  }
}

/** The bundle's signature did not verify against its embedded public_key. */
export class SignatureMismatchError extends MarketplaceError {
  override readonly name = 'SignatureMismatchError';
  /** Reason string from the verifier (e.g. 'bad signature'). */
  readonly reason: string;
  /** Address that failed. */
  readonly address: string;

  constructor(address: string, reason: string) {
    super(`signature mismatch for ${address}: ${reason}`);
    this.address = address;
    this.reason = reason;
  }
}

/**
 * The bundle's `key_id` does not match what TOFU previously cached for
 * this author (or doesn't match the explicit `?signed_by=` pin).
 *
 * Carries both fingerprints so a UI can show the diff and let the user
 * either trust the new key (call `store.set(author, observed)` then retry)
 * or refuse and look up what changed.
 */
export class MarketplaceTrustError extends MarketplaceError {
  override readonly name = 'MarketplaceTrustError';
  readonly author: string;
  readonly knownKeyId: string;
  readonly observedKeyId: string;

  constructor(author: string, knownKeyId: string, observedKeyId: string) {
    super(
      `key changed for ${author}: cached=${knownKeyId} observed=${observedKeyId}. ` +
        `Run trustedKeys.set('${author}', '${observedKeyId}') to accept the new key.`,
    );
    this.author = author;
    this.knownKeyId = knownKeyId;
    this.observedKeyId = observedKeyId;
  }
}

/**
 * Web Crypto-based ed25519 verifier — same approach as `JwksCache` in
 * `client.ts`. Pure function: takes a bundle, returns ok/false. Mirrors
 * `verifyBundleSignature` in `@cir/vault-server` but in browser-safe Web
 * Crypto so no Node dep leaks into a bundled web build.
 */
async function verifyBundleSignatureWeb(
  bundle: SignedBundle,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const publicKeyRaw = b64ToBytes(bundle.public_key);
  if (publicKeyRaw === null) return { ok: false, reason: 'public_key is not valid base64' };
  if (publicKeyRaw.length !== 32) {
    return { ok: false, reason: 'public_key must be 32 raw ed25519 bytes' };
  }

  // Confirm key_id matches public_key bytes — the publisher cannot claim
  // a different fingerprint than the one their key actually has.
  const expected = await sha256Hex(publicKeyRaw);
  if (expected.slice(0, 16) !== bundle.key_id) {
    return {
      ok: false,
      reason: `key_id ${bundle.key_id} does not match public_key (${expected.slice(0, 16)})`,
    };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      toArrayBuffer(publicKeyRaw),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
  } catch (err) {
    return { ok: false, reason: `public_key import failed: ${(err as Error).message}` };
  }

  const sigBytes = b64ToBytes(bundle.signature);
  if (sigBytes === null) return { ok: false, reason: 'signature is not valid base64' };

  const signingInput = signingInputForBundle({
    address: bundle.address,
    payload: bundle.payload,
    timestamp: bundle.timestamp,
  });
  const data = new TextEncoder().encode(signingInput);

  const ok = await globalThis.crypto.subtle.verify(
    { name: 'Ed25519' },
    cryptoKey,
    toArrayBuffer(sigBytes),
    toArrayBuffer(data),
  );
  if (!ok) return { ok: false, reason: 'bad signature' };
  return { ok: true };
}

/** Web Crypto signing — pairs with the verifier above. */
async function signCanonicalEd25519(
  privateKeyRaw: Uint8Array,
  payload: string,
): Promise<Uint8Array> {
  if (privateKeyRaw.length !== 32) {
    throw new Error(
      `ed25519 private key must be 32 raw bytes (got ${String(privateKeyRaw.length)})`,
    );
  }
  // Web Crypto's `importKey` for Ed25519 accepts `pkcs8` for private keys.
  // Wrap the 32-byte seed in the static PKCS8 prefix.
  const pkcs8 = new Uint8Array([
    0x30,
    0x2e,
    0x02,
    0x01,
    0x00,
    0x30,
    0x05,
    0x06,
    0x03,
    0x2b,
    0x65,
    0x70,
    0x04,
    0x22,
    0x04,
    0x20,
    ...privateKeyRaw,
  ]);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(pkcs8),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  const data = new TextEncoder().encode(payload);
  const sig = await globalThis.crypto.subtle.sign(
    { name: 'Ed25519' },
    cryptoKey,
    toArrayBuffer(data),
  );
  return new Uint8Array(sig);
}

/** The inputs `publish()` accepts: raw 32-byte ed25519 keypair material. */
export interface MarketplaceKeyMaterial {
  /** Raw 32-byte ed25519 private seed. */
  privateKey: Uint8Array;
  /** Raw 32-byte ed25519 public point. */
  publicKey: Uint8Array;
}

/** Decode a base64 (NOT base64url) string into bytes. Returns null on bad input. */
function b64ToBytes(input: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/=]*$/.test(input)) return null;
  let bin: string;
  try {
    if (typeof atob === 'function') {
      bin = atob(input);
    } else {
      bin = Buffer.from(input, 'base64').toString('binary');
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encode bytes as standard base64. */
function bytesToB64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
    return btoa(s);
  }
  return Buffer.from(bytes).toString('base64');
}

/** Coerce a Uint8Array to a fresh ArrayBuffer (Web Crypto requires that). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/** Lowercase hex sha256 of bytes. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Compute the 16-hex key_id for a raw ed25519 public key. */
export async function computeKeyId(publicKeyRaw: Uint8Array): Promise<string> {
  return (await sha256Hex(publicKeyRaw)).slice(0, 16);
}

export interface MarketplaceClientOptions {
  /** Vault base URL (e.g. `http://localhost:4001`). */
  vaultUrl: string;
  /** Optional fetcher override (tests pass a stub). */
  fetcher?: typeof fetch;
  /** Optional TOFU store override. Default: localStorage in browser, in-memory in Node. */
  trustedKeys?: TrustedKeyStore;
  /** Optional clock override (ms). Default: `() => Date.now()`. */
  now?: () => number;
}

/** Result of `publish()`. */
export interface PublishResult {
  /** Canonical `cir://` address (no `signed_by`). */
  address: string;
  /** Fingerprint of the key that signed the bundle. */
  keyId: string;
}

/**
 * Marketplace client.
 *
 * One instance speaks to one vault URL. Hosts that talk to multiple
 * vaults instantiate one client per origin — TOFU bindings are
 * intentionally per-origin in the cache prefix because trust does not
 * carry across vault boundaries.
 */
export class MarketplaceClient {
  private readonly vaultUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly trustedKeys: TrustedKeyStore;
  private readonly now: () => number;

  constructor(opts: MarketplaceClientOptions) {
    this.vaultUrl = opts.vaultUrl.replace(/\/+$/, '');
    this.fetcher = opts.fetcher ?? fetch;
    this.trustedKeys = opts.trustedKeys ?? defaultTrustedKeyStore();
    this.now = opts.now ?? (() => Date.now());
  }

  /** The TOFU store this client was constructed with. Useful for tests + UIs. */
  get keyStore(): TrustedKeyStore {
    return this.trustedKeys;
  }

  /**
   * Sign + POST a bundle. The address shape is fixed by the URI; the
   * caller passes the parsed form so we don't repeat the parse error
   * surface on the publish path.
   */
  async publish(
    address: MarketplaceAddress | string,
    payload: unknown,
    key: MarketplaceKeyMaterial,
  ): Promise<PublishResult> {
    const parsedAddress = typeof address === 'string' ? parseMarketplaceAddress(address) : address;
    if (parsedAddress === null) {
      const text = typeof address === 'string' ? address : JSON.stringify(address);
      throw new MarketplaceError(`malformed address: ${text}`);
    }
    const timestamp = new Date(this.now()).toISOString();
    const signingInput = signingInputForBundle({ address: parsedAddress, payload, timestamp });
    const sigBytes = await signCanonicalEd25519(key.privateKey, signingInput);
    const keyId = await computeKeyId(key.publicKey);
    const bundle: SignedBundle = {
      address: {
        scheme: 'cir',
        author: parsedAddress.author,
        persona: parsedAddress.persona,
        version: parsedAddress.version,
      },
      payload,
      timestamp,
      signature: bytesToB64(sigBytes),
      public_key: bytesToB64(key.publicKey),
      key_id: keyId,
    };

    let res: Response;
    try {
      res = await this.fetcher(`${this.vaultUrl}/vault/marketplace/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bundle),
      });
    } catch (err) {
      throw new VaultUnreachableError(err as Error);
    }
    if (!res.ok) {
      const body = await readBodyOrText(res);
      throw new MarketplaceError(
        `publish failed: HTTP ${String(res.status)} ${typeof body === 'string' ? body : JSON.stringify(body)}`,
      );
    }
    const out = (await res.json()) as { address?: string; key_id?: string };
    return {
      address: out.address ?? formatMarketplaceAddress(parsedAddress),
      keyId: out.key_id ?? keyId,
    };
  }

  /**
   * GET + verify + TOFU. Returns the unwrapped `payload`. Throws
   * `SignatureMismatchError` on a bad signature, `MarketplaceTrustError`
   * on a TOFU mismatch, `MarketplaceError` on any other failure.
   */
  async fetch(address: MarketplaceAddress | string): Promise<unknown> {
    const parsedAddress = typeof address === 'string' ? parseMarketplaceAddress(address) : address;
    if (parsedAddress === null) {
      const text = typeof address === 'string' ? address : JSON.stringify(address);
      throw new MarketplaceError(`malformed address: ${text}`);
    }
    const path = `${this.vaultUrl}/vault/marketplace/${encodeURIComponent(
      parsedAddress.author,
    )}/${encodeURIComponent(parsedAddress.persona)}@${encodeURIComponent(parsedAddress.version)}`;
    let res: Response;
    try {
      res = await this.fetcher(path);
    } catch (err) {
      throw new VaultUnreachableError(err as Error);
    }
    if (!res.ok) {
      throw new MarketplaceError(`fetch failed: HTTP ${String(res.status)}`);
    }
    const wire = (await res.json()) as unknown;
    const parsed = SignedBundleSchema.safeParse(wire);
    if (!parsed.success) {
      throw new MarketplaceError(`malformed bundle response: ${parsed.error.message}`);
    }
    const bundle = parsed.data;

    // 1. Verify the signature LOCALLY before TOFU. A bad signature is a
    //    hard error regardless of whether the key is trusted.
    const verify = await verifyBundleSignatureWeb(bundle);
    if (!verify.ok) {
      throw new SignatureMismatchError(formatMarketplaceAddress(parsedAddress), verify.reason);
    }

    // 2. Honour an explicit `?signed_by=` pin if present. This is a
    //    publisher-asserted constraint — if it doesn't match, refuse.
    if (parsedAddress.signed_by !== undefined) {
      if (parsedAddress.signed_by !== bundle.key_id) {
        throw new MarketplaceTrustError(
          parsedAddress.author,
          parsedAddress.signed_by,
          bundle.key_id,
        );
      }
      // Pinned + matched. Don't touch TOFU; the pin overrides the cache.
      return bundle.payload;
    }

    // 3. TOFU: compare against the cached fingerprint, or record on first use.
    const known = await this.trustedKeys.get(parsedAddress.author);
    if (known === undefined) {
      await this.trustedKeys.set(parsedAddress.author, bundle.key_id);
    } else if (known !== bundle.key_id) {
      throw new MarketplaceTrustError(parsedAddress.author, known, bundle.key_id);
    }

    return bundle.payload;
  }
}

async function readBodyOrText(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}
