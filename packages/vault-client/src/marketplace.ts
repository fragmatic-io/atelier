// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace client — Wave 8 / V-6 (MVP).
 *
 * Pairs with `@atelier/vault-server`'s `marketplace.ts` over the HTTP wire. Two
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
import type { VaultClient } from './client.js';
import {
  MarketplaceAddressSchema,
  ReviewRecordSchema,
  SignedBundleSchema,
  canonicalJsonStringify,
  formatMarketplaceAddress,
  parseMarketplaceAddress,
  signingInputForBundle,
  type MarketplaceAddress,
  type ReviewRecord,
  type ReviewState,
  type SignedBundle,
} from '@atelier/schemas';

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

  constructor(prefix = 'atelier.marketplace.tofu.') {
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
 * `verifyBundleSignature` in `@atelier/vault-server` but in browser-safe Web
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
  /** Canonical `atelier://` address (no `signed_by`). */
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
        scheme: 'atelier',
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

// ---------------------------------------------------------------------------
// V-6.f — `publishPersona` sign-at-publish helper.
//
// Pairs with `POST /marketplace/persona` on the server (V-6.a). The CLI
// reaches for this; programmatic publishers can too.
//
// The helper:
//   1. Derives the public key from the supplied 32-byte ed25519 seed (via
//      Web Crypto's `importKey({ name: 'Ed25519' }, 'pkcs8')` — same path
//      `MarketplaceClient.publish` uses).
//   2. Builds canonical signing bytes via `signingInputForBundle`.
//   3. Signs.
//   4. POSTs the resulting `SignedBundle` to `/marketplace/persona` on
//      the same vault the supplied `VaultClient` is configured against.
//   5. Returns the parsed `MarketplaceAddress` from the server's 201 response.
//
// Why a free function vs. another method on `MarketplaceClient`: the
// `MarketplaceClient.publish` flow is the LEGACY (publish-with-bundle-pubkey)
// path. The persona endpoints have different semantics (server-known author
// keys + 401 / 409 surface) so the helper is named distinctly to avoid
// confusion at call sites.
// ---------------------------------------------------------------------------

/**
 * Pre-signing inputs to `publishPersona`. The caller supplies the
 * address (or a parseable `atelier://` string) + the payload — the
 * helper produces the timestamp at sign time so each publish is fresh.
 */
export interface BundlePayload {
  /** Parsed `MarketplaceAddress` or its `atelier://...` string form. */
  address: MarketplaceAddress | string;
  /** Anything — recipe, persona JSON, capability set. Same shape the server stores. */
  payload: unknown;
  /**
   * Optional explicit timestamp. Default: `new Date().toISOString()`. Tests
   * pin this; production callers leave it undefined.
   */
  timestamp?: string;
}

/** Author identity + signing key. */
export interface MarketplaceAuthor {
  /** Author handle. Must match the `address.author` in the bundle. */
  id: string;
  /**
   * Raw 32-byte ed25519 PRIVATE seed. The matching public key is derived
   * automatically via Web Crypto. Pass `publicKey` explicitly to skip the
   * derivation.
   */
  privateKey: Uint8Array;
  /**
   * Optional pre-derived public key (raw 32-byte ed25519 point). When
   * omitted, we derive it from `privateKey`. Useful in tests + when the
   * caller already has both halves on hand.
   */
  publicKey?: Uint8Array;
}

/**
 * Build the canonical signing bytes for a `BundlePayload`, sign them
 * with the author's private key, and POST the resulting `SignedBundle`
 * to `POST /marketplace/persona` on the supplied client's vault.
 *
 * Returns the parsed canonical address. Throws `MarketplaceError`
 * (subclass thereof for the specific surfaces) on any non-2xx response.
 */
export async function publishPersona(
  client: VaultClient,
  bundle: BundlePayload,
  author: MarketplaceAuthor,
): Promise<MarketplaceAddress> {
  const parsedAddress =
    typeof bundle.address === 'string' ? parseMarketplaceAddress(bundle.address) : bundle.address;
  if (parsedAddress === null) {
    const text =
      typeof bundle.address === 'string' ? bundle.address : JSON.stringify(bundle.address);
    throw new MarketplaceError(`malformed address: ${text}`);
  }
  // Defence-in-depth: the address.author MUST match `author.id`. The
  // server enforces this too (the directory key is keyed on
  // `address.author`), but catching it here gives a faster, clearer
  // error before any signing work happens.
  if (parsedAddress.author !== author.id) {
    throw new MarketplaceError(
      `author mismatch: bundle.address.author='${parsedAddress.author}' but author.id='${author.id}'`,
    );
  }

  const publicKey = author.publicKey ?? (await derivePublicKey(author.privateKey));
  const timestamp = bundle.timestamp ?? new Date().toISOString();
  const signingInput = signingInputForBundle({
    address: parsedAddress,
    payload: bundle.payload,
    timestamp,
  });
  const sigBytes = await signCanonicalEd25519(author.privateKey, signingInput);
  const keyId = await computeKeyId(publicKey);
  const signedBundle: SignedBundle = {
    address: {
      scheme: 'atelier',
      author: parsedAddress.author,
      persona: parsedAddress.persona,
      version: parsedAddress.version,
    },
    payload: bundle.payload,
    timestamp,
    signature: bytesToB64(sigBytes),
    public_key: bytesToB64(publicKey),
    key_id: keyId,
  };

  // Reach into the client for the configured vault URL + fetcher. We
  // don't expose those publicly because the client owns its transport;
  // duck-typing through the JS structural shape is the lowest-friction
  // path that doesn't break encapsulation for normal callers.
  const fetcher: typeof fetch = (client as unknown as { fetcher?: typeof fetch }).fetcher ?? fetch;
  const vaultUrl: string = (client as unknown as { vaultUrl?: string }).vaultUrl ?? '';
  if (vaultUrl === '') {
    throw new MarketplaceError('VaultClient is missing vaultUrl');
  }

  let res: Response;
  try {
    res = await fetcher(`${vaultUrl}/marketplace/persona`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signedBundle),
    });
  } catch (err) {
    throw new VaultUnreachableError(err as Error);
  }

  if (res.status === 401) {
    throw new MarketplaceError(`publishPersona: 401 unauthorized — ${await readErrorReason(res)}`);
  }
  if (res.status === 409) {
    throw new MarketplaceError(`publishPersona: 409 duplicate — ${await readErrorReason(res)}`);
  }
  if (res.status === 400) {
    throw new MarketplaceError(`publishPersona: 400 bad request — ${await readErrorReason(res)}`);
  }
  if (!res.ok) {
    throw new MarketplaceError(
      `publishPersona: HTTP ${String(res.status)} — ${await readErrorReason(res)}`,
    );
  }
  const body = (await res.json()) as { address?: string };
  if (typeof body.address !== 'string') {
    throw new MarketplaceError('publishPersona: server response missing address');
  }
  const parsedOut = parseMarketplaceAddress(body.address);
  if (parsedOut === null) {
    // Defensive: the server SHOULD echo the canonical form, but if it
    // doesn't, fall back to the address we built locally — the publish
    // succeeded by HTTP status.
    const validated = MarketplaceAddressSchema.safeParse(signedBundle.address);
    if (!validated.success) {
      throw new MarketplaceError(`publishPersona: malformed address from server: ${body.address}`);
    }
    return validated.data;
  }
  return parsedOut;
}

/** Read the `error` field of an error response, or fall back to text. */
async function readErrorReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; reason?: string };
    if (body.reason !== undefined) return `${body.error ?? 'error'}: ${body.reason}`;
    return body.error ?? `HTTP ${String(res.status)}`;
  } catch {
    try {
      return await res.text();
    } catch {
      return `HTTP ${String(res.status)}`;
    }
  }
}

/**
 * Derive the raw 32-byte ed25519 public key from a 32-byte private seed.
 * Uses Web Crypto's PKCS8 import + JWK export round-trip — works in both
 * Node 22+ (which exposes `crypto.subtle` as a global) and the browser.
 */
async function derivePublicKey(privateKeyRaw: Uint8Array): Promise<Uint8Array> {
  if (privateKeyRaw.length !== 32) {
    throw new MarketplaceError(
      `ed25519 private key must be 32 raw bytes (got ${String(privateKeyRaw.length)})`,
    );
  }
  // Wrap the seed in PKCS8 prefix so Web Crypto accepts it (same prefix
  // `signCanonicalEd25519` uses). Then export as JWK and pull the `x`
  // coordinate (the public point in base64url).
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
    true,
    ['sign'],
  );
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', cryptoKey);
  const xB64u = jwk.x;
  if (typeof xB64u !== 'string') {
    throw new MarketplaceError('derivePublicKey: JWK missing x coordinate');
  }
  // base64url → bytes
  const xB64 = xB64u.replace(/-/g, '+').replace(/_/g, '/');
  const padded = xB64 + '='.repeat((4 - (xB64.length % 4)) % 4);
  const out = b64ToBytes(padded);
  if (out === null || out.length !== 32) {
    throw new MarketplaceError('derivePublicKey: invalid public key bytes');
  }
  return out;
}

// ---------------------------------------------------------------------------
// V-6.d — review / curation helpers.
//
// Three helpers pair with the new server endpoints:
//
//   - `submitReview(client, address, opts)` — builds canonical signing
//     bytes for the review envelope, signs via Web Crypto ed25519, POSTs
//     to `/marketplace/review/<a>/<p>@<v>`, returns the persisted
//     `ReviewRecord`. The signing input is structurally identical to
//     `signingInputForBundle` but over a `{address, state, reviewer_id,
//     notes?, timestamp}` envelope so any third-party signer that
//     already knows how to sign a publish bundle can reuse the canonical
//     JSON encoder.
//   - `fetchReview(client, address)` — GETs the record. Returns `null`
//     on 404 so callers can branch without exception-handling for the
//     "no record yet" case.
//   - `listMarketplace(client, query?)` — GETs the curated index. Returns
//     `MarketplaceListing[]` mirroring the V-6.c `<MarketplaceBrowser>`
//     shape so a host can wire the browse UI through one fetcher.
// ---------------------------------------------------------------------------

/**
 * Mirrors the wire shape returned by `GET /marketplace/index`. We keep
 * this inline rather than importing from `@atelier/components` because
 * `@atelier/vault-client` should not take a runtime dep on the
 * components package. Hosts can pass the result straight into
 * `<MarketplaceBrowser>`'s `MarketplaceClient.list()` — TypeScript
 * treats the two structurally identical.
 */
export interface MarketplaceListing {
  address: {
    scheme: 'atelier';
    author: string;
    persona: string;
    version: string;
    raw: string;
  };
  description: string;
  domain?: string;
  brandKitId?: string;
  publishedAt: string;
  authorDisplayName?: string;
  /** V-6.d review state at index time. Always present on indexed rows. */
  reviewState: ReviewState;
}

/** Filter shape passed to `listMarketplace`. Mirrors the components-side type. */
export interface MarketplaceListQuery {
  author?: string;
  domain?: string;
  brandKitId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  /**
   * Maintainer escape hatch: comma-joined or array form is accepted; the
   * helper renders an array as a comma-joined query param. Each value
   * must be a valid `ReviewState`. Default is approved-only.
   */
  include?: ReviewState | readonly ReviewState[];
}

/** Build canonical signing bytes for a review envelope. */
export function signingInputForReview(input: {
  address: MarketplaceAddress;
  state: ReviewState;
  reviewer_id: string;
  notes?: string;
  timestamp: string;
}): string {
  const address: MarketplaceAddress = {
    scheme: 'atelier',
    author: input.address.author,
    persona: input.address.persona,
    version: input.address.version,
  };
  const envelope: Record<string, unknown> = {
    address,
    state: input.state,
    reviewer_id: input.reviewer_id,
    timestamp: input.timestamp,
  };
  if (input.notes !== undefined) envelope['notes'] = input.notes;
  return canonicalJsonStringify(envelope);
}

/** Inputs to `submitReview`. */
export interface SubmitReviewOptions {
  /** New state to transition to. */
  state: ReviewState;
  /** Optional human note attached to the record. */
  notes?: string;
  /** Reviewer handle. The server's `ReviewerKeyDirectory` must know this. */
  reviewerId: string;
  /** Raw 32-byte ed25519 private seed. */
  privateKey: Uint8Array;
  /** Optional pre-derived public key. Default: derived from `privateKey`. */
  publicKey?: Uint8Array;
  /** Optional explicit timestamp. Default: `new Date().toISOString()`. */
  timestamp?: string;
}

/**
 * Sign + POST a review submission to `POST /marketplace/review/...`.
 * Returns the persisted `ReviewRecord` on success. Throws
 * `MarketplaceError` on any non-2xx response.
 */
export async function submitReview(
  client: VaultClient,
  address: MarketplaceAddress | string,
  opts: SubmitReviewOptions,
): Promise<ReviewRecord> {
  const parsedAddress = typeof address === 'string' ? parseMarketplaceAddress(address) : address;
  if (parsedAddress === null) {
    const text = typeof address === 'string' ? address : JSON.stringify(address);
    throw new MarketplaceError(`malformed address: ${text}`);
  }

  const publicKey = opts.publicKey ?? (await derivePublicKey(opts.privateKey));
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const signingArgs: Parameters<typeof signingInputForReview>[0] = {
    address: parsedAddress,
    state: opts.state,
    reviewer_id: opts.reviewerId,
    timestamp,
  };
  if (opts.notes !== undefined) signingArgs.notes = opts.notes;
  const signingInput = signingInputForReview(signingArgs);
  const sigBytes = await signCanonicalEd25519(opts.privateKey, signingInput);
  const keyId = await computeKeyId(publicKey);

  const envelope: {
    state: ReviewState;
    reviewer_id: string;
    notes?: string;
    timestamp: string;
    signature: string;
    public_key: string;
    key_id: string;
  } = {
    state: opts.state,
    reviewer_id: opts.reviewerId,
    timestamp,
    signature: bytesToB64(sigBytes),
    public_key: bytesToB64(publicKey),
    key_id: keyId,
  };
  if (opts.notes !== undefined) envelope.notes = opts.notes;

  const fetcher: typeof fetch = (client as unknown as { fetcher?: typeof fetch }).fetcher ?? fetch;
  const vaultUrl: string = (client as unknown as { vaultUrl?: string }).vaultUrl ?? '';
  if (vaultUrl === '') {
    throw new MarketplaceError('VaultClient is missing vaultUrl');
  }

  const path =
    `${vaultUrl}/marketplace/review/${encodeURIComponent(parsedAddress.author)}/` +
    `${encodeURIComponent(parsedAddress.persona)}@${encodeURIComponent(parsedAddress.version)}`;

  let res: Response;
  try {
    res = await fetcher(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    });
  } catch (err) {
    throw new VaultUnreachableError(err as Error);
  }
  if (res.status === 401) {
    throw new MarketplaceError(`submitReview: 401 unauthorized — ${await readErrorReason(res)}`);
  }
  if (res.status === 404) {
    throw new MarketplaceError(`submitReview: 404 not found — ${await readErrorReason(res)}`);
  }
  if (!res.ok) {
    throw new MarketplaceError(
      `submitReview: HTTP ${String(res.status)} — ${await readErrorReason(res)}`,
    );
  }
  const body = (await res.json()) as unknown;
  const parsed = ReviewRecordSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketplaceError(`submitReview: malformed response: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Fetch the review record at `address`. Returns `null` on 404 (no record
 * exists yet). Throws `MarketplaceError` on other non-2xx responses.
 */
export async function fetchReview(
  client: VaultClient,
  address: MarketplaceAddress | string,
): Promise<ReviewRecord | null> {
  const parsedAddress = typeof address === 'string' ? parseMarketplaceAddress(address) : address;
  if (parsedAddress === null) {
    const text = typeof address === 'string' ? address : JSON.stringify(address);
    throw new MarketplaceError(`malformed address: ${text}`);
  }
  const fetcher: typeof fetch = (client as unknown as { fetcher?: typeof fetch }).fetcher ?? fetch;
  const vaultUrl: string = (client as unknown as { vaultUrl?: string }).vaultUrl ?? '';
  if (vaultUrl === '') {
    throw new MarketplaceError('VaultClient is missing vaultUrl');
  }
  const path =
    `${vaultUrl}/marketplace/review/${encodeURIComponent(parsedAddress.author)}/` +
    `${encodeURIComponent(parsedAddress.persona)}@${encodeURIComponent(parsedAddress.version)}`;
  let res: Response;
  try {
    res = await fetcher(path);
  } catch (err) {
    throw new VaultUnreachableError(err as Error);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new MarketplaceError(
      `fetchReview: HTTP ${String(res.status)} — ${await readErrorReason(res)}`,
    );
  }
  const body = (await res.json()) as unknown;
  const parsed = ReviewRecordSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketplaceError(`fetchReview: malformed response: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Fetch the curated browse index. Returns `MarketplaceListing[]` —
 * structurally compatible with `<MarketplaceBrowser>`'s
 * `MarketplaceClient.list()` shape.
 */
export async function listMarketplace(
  client: VaultClient,
  query?: MarketplaceListQuery,
): Promise<MarketplaceListing[]> {
  const fetcher: typeof fetch = (client as unknown as { fetcher?: typeof fetch }).fetcher ?? fetch;
  const vaultUrl: string = (client as unknown as { vaultUrl?: string }).vaultUrl ?? '';
  if (vaultUrl === '') {
    throw new MarketplaceError('VaultClient is missing vaultUrl');
  }

  const params = new URLSearchParams();
  if (query?.author !== undefined && query.author !== '') params.set('author', query.author);
  if (query?.domain !== undefined && query.domain !== '') params.set('domain', query.domain);
  if (query?.brandKitId !== undefined && query.brandKitId !== '') {
    params.set('brandKitId', query.brandKitId);
  }
  if (query?.search !== undefined && query.search !== '') params.set('search', query.search);
  if (query?.limit !== undefined) params.set('limit', String(query.limit));
  if (query?.offset !== undefined) params.set('offset', String(query.offset));
  if (query?.include !== undefined) {
    const inc: string = Array.isArray(query.include)
      ? query.include.join(',')
      : (query.include as string);
    if (inc !== '') params.set('include', inc);
  }

  const qs = params.toString();
  const path = `${vaultUrl}/marketplace/index${qs.length > 0 ? `?${qs}` : ''}`;

  let res: Response;
  try {
    res = await fetcher(path);
  } catch (err) {
    throw new VaultUnreachableError(err as Error);
  }
  if (!res.ok) {
    throw new MarketplaceError(
      `listMarketplace: HTTP ${String(res.status)} — ${await readErrorReason(res)}`,
    );
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new MarketplaceError('listMarketplace: response is not an array');
  }
  return body as MarketplaceListing[];
}
