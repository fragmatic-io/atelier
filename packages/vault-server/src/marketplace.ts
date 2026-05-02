// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Marketplace endpoints — Wave 8 / V-6 (MVP).
 *
 * Two routes:
 *   POST  /vault/marketplace/publish              — accept a signed bundle.
 *   GET   /vault/marketplace/<author>/<persona>@<version>
 *                                                 — return the signed bundle.
 *
 * The signature is verified BEFORE storage on publish; the fetcher returns
 * the bundle verbatim (signature + public_key intact) so the client can
 * independently re-verify and run the TOFU check.
 *
 * Storage layout: bundles live under `<storageRoot>/marketplace/<author>/
 * <persona>@<version>.json`. One file per `address`. Re-publishing the same
 * `<author>/<persona>@<version>` overwrites — the publisher OWNS the
 * address. (Immutability per-version is a follow-up; today we trust the
 * signed timestamp to disambiguate stale fetches.)
 *
 * What's deferred (not in this MVP):
 *   - Review-flow UI (vault-server consent screen for marketplace listings)
 *   - Search / discovery endpoints
 *   - Versioning / dependency resolution beyond exact-match
 *   - Multi-author key registration (today the bundle's `public_key` IS
 *     the author key; key-rotation cache lives in the client's TOFU store).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicKey, createHash, verify as nodeVerify } from 'node:crypto';
import { dirname, join } from 'node:path';

import {
  SignedBundleSchema,
  formatMarketplaceAddress,
  parseMarketplaceAddress,
  signingInputForBundle,
  type MarketplaceAddress,
  type SignedBundle,
} from '@cir/schemas';

import type { VaultRequest, VaultResponse } from './server.js';

/**
 * Storage adapter. The default file-backed adapter writes one JSON file per
 * `<author>/<persona>@<version>`. Tests use the in-memory variant.
 */
export interface MarketplaceStorage {
  put(address: MarketplaceAddress, bundle: SignedBundle): void;
  get(address: MarketplaceAddress): SignedBundle | undefined;
}

/**
 * In-memory storage. Lives behind a `Map` keyed by the canonical
 * `cir://author/persona@version` address (without `signed_by`).
 */
export class MemoryMarketplaceStorage implements MarketplaceStorage {
  private store = new Map<string, SignedBundle>();

  put(address: MarketplaceAddress, bundle: SignedBundle): void {
    this.store.set(addressKey(address), bundle);
  }

  get(address: MarketplaceAddress): SignedBundle | undefined {
    return this.store.get(addressKey(address));
  }
}

/**
 * JSON-file storage. One file per address: `<root>/marketplace/<author>/
 * <persona>@<version>.json`. Mirrors the existing `JsonFileVaultStorage`
 * style — synchronous reads/writes, sufficient for v0 single-process.
 *
 * Why a flat directory: filesystem listings are cheap and the files are
 * small. A SQLite/Postgres adapter is the upgrade path the same way it is
 * for the grant store.
 */
export class JsonFileMarketplaceStorage implements MarketplaceStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private pathFor(address: MarketplaceAddress): string {
    return join(this.root, address.author, `${address.persona}@${address.version}.json`);
  }

  put(address: MarketplaceAddress, bundle: SignedBundle): void {
    const filePath = this.pathFor(address);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf8');
  }

  get(address: MarketplaceAddress): SignedBundle | undefined {
    const filePath = this.pathFor(address);
    if (!existsSync(filePath)) return undefined;
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as SignedBundle;
    } catch {
      return undefined;
    }
  }
}

/** Canonical key for a marketplace address — strips `signed_by`. */
function addressKey(address: MarketplaceAddress): string {
  return formatMarketplaceAddress({
    scheme: 'cir',
    author: address.author,
    persona: address.persona,
    version: address.version,
  });
}

/**
 * Compute the 16-hex-char fingerprint of an ed25519 public key (raw 32-byte
 * point). Mirrors `MarketplaceKeyId` shape in the schemas package.
 */
export function computeKeyId(rawPublicKey: Buffer): string {
  return createHash('sha256').update(rawPublicKey).digest('hex').slice(0, 16);
}

/** Decode a base64 (NOT base64url) string into a Buffer. */
function b64Decode(input: string): Buffer {
  return Buffer.from(input, 'base64');
}

/**
 * Verify a `SignedBundle`'s signature in isolation. Pure function — used
 * server-side on publish + client-side on fetch.
 *
 * Returns `{ ok: true }` on a valid signature; `{ ok: false, reason }`
 * otherwise. We avoid throwing here so the caller can produce a structured
 * 400/401 with the failure reason intact.
 */
export function verifyBundleSignature(
  bundle: SignedBundle,
): { ok: true } | { ok: false; reason: string } {
  let publicKeyBytes: Buffer;
  try {
    publicKeyBytes = b64Decode(bundle.public_key);
  } catch {
    return { ok: false, reason: 'public_key is not valid base64' };
  }
  if (publicKeyBytes.length !== 32) {
    return { ok: false, reason: 'public_key must be 32 raw ed25519 bytes' };
  }
  // Confirm key_id matches the public_key bytes — the publisher cannot
  // claim a different fingerprint than the one their key actually has.
  const expectedKid = computeKeyId(publicKeyBytes);
  if (expectedKid !== bundle.key_id) {
    return {
      ok: false,
      reason: `key_id ${bundle.key_id} does not match public_key (${expectedKid})`,
    };
  }

  // Build the SPKI-wrapped form node:crypto expects. The 12-byte ASN.1
  // prefix below is the static SPKI header for an Ed25519 public key.
  const spki = Buffer.concat([
    Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]),
    publicKeyBytes,
  ]);
  let publicKey;
  try {
    publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  } catch (err) {
    return { ok: false, reason: `public_key import failed: ${(err as Error).message}` };
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = b64Decode(bundle.signature);
  } catch {
    return { ok: false, reason: 'signature is not valid base64' };
  }

  const signingInput = signingInputForBundle({
    address: bundle.address,
    payload: bundle.payload,
    timestamp: bundle.timestamp,
  });

  const ok = nodeVerify(null, Buffer.from(signingInput, 'utf8'), publicKey, signatureBytes);
  if (!ok) return { ok: false, reason: 'bad signature' };
  return { ok: true };
}

/**
 * Pull `<author>/<persona>@<version>` out of a `/vault/marketplace/...`
 * fetch path and parse it into an address. Returns null on any malformed
 * input (bad URL-encoding, missing segments, bad semver).
 */
export function parseFetchPath(path: string): MarketplaceAddress | null {
  const prefix = '/vault/marketplace/';
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  // The rest is `<author>/<persona>@<version>`. We don't decodeURIComponent
  // the whole thing — `@` and `.` are reserved structural chars. Decode the
  // segments individually.
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const author = decodeSegment(rest.slice(0, slash));
  if (author === null) return null;
  const tail = rest.slice(slash + 1);
  const at = tail.lastIndexOf('@');
  if (at === -1) return null;
  const persona = decodeSegment(tail.slice(0, at));
  const version = decodeSegment(tail.slice(at + 1));
  if (persona === null || version === null) return null;
  return parseMarketplaceAddress(`cir://${author}/${persona}@${version}`);
}

function decodeSegment(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** JSON helper. */
function json(status: number, body: unknown): VaultResponse {
  return { status, body };
}

/**
 * Match + handle a marketplace request. Returns `null` when the path
 * doesn't match any marketplace route so the caller can fall through to
 * the rest of the dispatcher.
 */
export function handleMarketplaceRequest(
  storage: MarketplaceStorage,
  req: VaultRequest,
): VaultResponse | null {
  // POST /vault/marketplace/publish — accept + verify + store.
  if (req.method === 'POST' && req.path === '/vault/marketplace/publish') {
    const parsed = SignedBundleSchema.safeParse(req.body);
    if (!parsed.success) {
      return json(400, {
        error: 'malformed bundle',
        issues: parsed.error.issues,
      });
    }
    const bundle = parsed.data;
    const result = verifyBundleSignature(bundle);
    if (!result.ok) {
      return json(400, { error: 'signature verification failed', reason: result.reason });
    }
    storage.put(bundle.address, bundle);
    return json(201, {
      address: formatMarketplaceAddress({
        scheme: 'cir',
        author: bundle.address.author,
        persona: bundle.address.persona,
        version: bundle.address.version,
      }),
      key_id: bundle.key_id,
    });
  }

  // GET /vault/marketplace/<author>/<persona>@<version> — fetch.
  if (req.method === 'GET' && req.path.startsWith('/vault/marketplace/')) {
    // Skip the publish path's GET (which doesn't exist; return 404 below).
    if (req.path === '/vault/marketplace/publish') {
      return json(404, { error: 'GET /vault/marketplace/publish not allowed' });
    }
    const address = parseFetchPath(req.path);
    if (address === null) {
      return json(400, { error: 'malformed marketplace address in path' });
    }
    const bundle = storage.get(address);
    if (bundle === undefined) {
      return json(404, {
        error: 'bundle not found',
        address: formatMarketplaceAddress(address),
      });
    }
    return json(200, bundle);
  }

  return null;
}
