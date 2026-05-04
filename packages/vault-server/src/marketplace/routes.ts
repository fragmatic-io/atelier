// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace HTTP routes — V-6.a (publish) + V-6.b (consume).
 *
 * Three routes:
 *
 *   POST  /marketplace/persona
 *     Body: SignedBundle. Verifies the ed25519 signature against the
 *     KEY DIRECTORY entry for `bundle.address.author` (NOT the bundle's
 *     embedded public_key — the legacy `/vault/marketplace/publish`
 *     endpoint did the latter, which is a different trust posture).
 *     201 on success, 400 on schema fail, 401 on signature fail or
 *     unknown author, 409 on duplicate `(author, persona, version)`.
 *
 *   GET   /marketplace/persona/<author>/<persona>@<version>
 *     Returns the SignedBundle as-is so consumers can re-verify. 200 on
 *     hit, 404 on miss. Cache-Control: long max-age + immutable (the
 *     content is addressed by `(author, persona, version)`; an exact
 *     version-pin is immutable by construction — no overwrite path).
 *
 *   GET   /marketplace/persona/<author>/<persona>/latest
 *     Returns `{ address, bundle }` for the highest-semver version of
 *     the `(author, persona)` pair. 200 on hit, 404 on miss. Cache-
 *     Control: short max-age + must-revalidate (latest moves over time).
 *
 * The route layer is a pure function `(req) => res | null`. Returning
 * `null` means "no marketplace route matched"; the dispatcher falls
 * through to legacy and other handlers.
 */
import { createPublicKey, verify as nodeVerify } from 'node:crypto';

import {
  SignedBundleSchema,
  formatMarketplaceAddress,
  signingInputForBundle,
  type MarketplaceAddress,
  type SignedBundle,
} from '@atelier/schemas';

import type { VaultRequest, VaultResponse } from '../server.js';
import type { KeyDirectory } from './key-directory.js';
import { computeKeyId } from './key-directory.js';
import { makePendingReviewRecord, type ReviewStore } from './review-store.js';
import type { MarketplaceStore } from './store.js';

/** Route prefix that this module owns. */
export const MARKETPLACE_PREFIX = '/marketplace/persona';

/**
 * Verify the bundle's signature against the AUTHOR'S registered public
 * key from the directory. Returns `{ ok: true }` on success, or a
 * structured `{ ok: false, reason }` for the route layer to map onto a
 * 401.
 *
 * Pure function — extracted so tests can drive it without standing up a
 * VaultRequest pipeline.
 */
export async function verifyAuthorSignature(
  bundle: SignedBundle,
  directory: KeyDirectory,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const registered = await directory.get(bundle.address.author);
  if (registered === undefined) {
    return { ok: false, reason: `unknown author '${bundle.address.author}'` };
  }
  if (registered.length !== 32) {
    return { ok: false, reason: 'registered public key is not 32 raw ed25519 bytes' };
  }

  // The bundle's `key_id` MUST match the registered key — i.e. the
  // claimed signer is in fact the directory entry. This is the check
  // that distinguishes "an author's bundle" from "a bundle the author
  // didn't sign."
  const expectedKid = computeKeyId(registered);
  if (bundle.key_id !== expectedKid) {
    return {
      ok: false,
      reason: `key_id ${bundle.key_id} does not match registered key (${expectedKid})`,
    };
  }

  // Build SPKI-wrapped form so node:crypto can import the raw point.
  // The 12-byte ASN.1 prefix is the static SPKI header for an Ed25519
  // public key.
  const spki = Buffer.concat([
    Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]),
    Buffer.from(registered),
  ]);
  let publicKey;
  try {
    publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  } catch (err) {
    return { ok: false, reason: `public_key import failed: ${(err as Error).message}` };
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(bundle.signature, 'base64');
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

/** JSON helper. */
function json(status: number, body: unknown, headers?: Record<string, string>): VaultResponse {
  if (headers !== undefined) return { status, body, headers };
  return { status, body };
}

/**
 * Pull `<author>/<persona>@<version>` out of a path of the form
 * `/marketplace/persona/<author>/<persona>@<version>`. Returns null on
 * any malformed input.
 */
function parseConsumeExactPath(
  path: string,
): { author: string; persona: string; version: string } | null {
  if (!path.startsWith(`${MARKETPLACE_PREFIX}/`)) return null;
  const rest = path.slice(MARKETPLACE_PREFIX.length + 1);
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
  return { author, persona, version };
}

/** Pull `<author>/<persona>` for the `/latest` route. */
function parseConsumeLatestPath(path: string): { author: string; persona: string } | null {
  const suffix = '/latest';
  if (!path.startsWith(`${MARKETPLACE_PREFIX}/`) || !path.endsWith(suffix)) return null;
  const rest = path.slice(MARKETPLACE_PREFIX.length + 1, path.length - suffix.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const author = decodeSegment(rest.slice(0, slash));
  const persona = decodeSegment(rest.slice(slash + 1));
  if (author === null || persona === null) return null;
  // Reject nested `/` after persona — `<persona>/foo/latest` is not us.
  if (persona.includes('/')) return null;
  return { author, persona };
}

function decodeSegment(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/**
 * Match + handle a marketplace request. Returns `null` when no route
 * matches so the caller falls through to other handlers.
 *
 * The optional `reviewStore` (V-6.d) is wired through so the publish
 * path can auto-create a `pending` review record on first publish. When
 * `reviewStore` is undefined the auto-create is skipped — back-compat
 * with the V-6.a / V-6.b call sites that didn't know about reviews.
 */
export async function handleMarketplacePersonaRequest(
  store: MarketplaceStore,
  directory: KeyDirectory,
  req: VaultRequest,
  reviewStore?: ReviewStore,
): Promise<VaultResponse | null> {
  // ---- POST /marketplace/persona — publish ------------------------------
  if (req.method === 'POST' && req.path === MARKETPLACE_PREFIX) {
    const parsed = SignedBundleSchema.safeParse(req.body);
    if (!parsed.success) {
      return json(400, { error: 'malformed bundle', issues: parsed.error.issues });
    }
    const bundle = parsed.data;

    const result = await verifyAuthorSignature(bundle, directory);
    if (!result.ok) {
      return json(401, { error: 'signature verification failed', reason: result.reason });
    }

    const stored = await store.put(bundle.address, bundle);
    if (!stored) {
      return json(409, {
        error: 'duplicate',
        address: formatMarketplaceAddress(bundle.address),
      });
    }

    // V-6.d — auto-create a `pending` review record on first publish.
    // Idempotent: if a record already exists (it shouldn't, given the
    // 409 above guarantees first-publish), preserve it.
    if (reviewStore !== undefined) {
      const existing = await reviewStore.get(bundle.address);
      if (existing === undefined) {
        await reviewStore.put(makePendingReviewRecord(bundle.address, bundle.timestamp));
      }
    }

    return json(201, {
      address: formatMarketplaceAddress({
        scheme: 'atelier',
        author: bundle.address.author,
        persona: bundle.address.persona,
        version: bundle.address.version,
      }),
      key_id: bundle.key_id,
    });
  }

  // ---- GET /marketplace/persona/<author>/<persona>/latest --------------
  // Match latest BEFORE the exact-version route because the exact-version
  // matcher would happily parse `/.../persona/latest` into persona='latest'
  // (no `@` in path → null), but the latest route is more specific.
  if (req.method === 'GET' && req.path.endsWith('/latest')) {
    const parsedPath = parseConsumeLatestPath(req.path);
    if (parsedPath !== null) {
      const bundle = await store.latest(parsedPath.author, parsedPath.persona);
      if (bundle === undefined) {
        return json(
          404,
          {
            error: 'no versions found',
            author: parsedPath.author,
            persona: parsedPath.persona,
          },
          // `latest` moves over time; allow brief caching but require revalidation.
          { 'cache-control': 'public, max-age=30, must-revalidate' },
        );
      }
      const address: MarketplaceAddress = {
        scheme: 'atelier',
        author: bundle.address.author,
        persona: bundle.address.persona,
        version: bundle.address.version,
      };
      return json(
        200,
        { address: formatMarketplaceAddress(address), bundle },
        { 'cache-control': 'public, max-age=30, must-revalidate' },
      );
    }
  }

  // ---- GET /marketplace/persona/<author>/<persona>@<version> ------------
  if (req.method === 'GET' && req.path.startsWith(`${MARKETPLACE_PREFIX}/`)) {
    const parsedPath = parseConsumeExactPath(req.path);
    if (parsedPath === null) {
      return json(400, { error: 'malformed marketplace address in path' });
    }
    const address: MarketplaceAddress = {
      scheme: 'atelier',
      author: parsedPath.author,
      persona: parsedPath.persona,
      version: parsedPath.version,
    };
    const bundle = await store.get(address);
    if (bundle === undefined) {
      return json(404, {
        error: 'bundle not found',
        address: formatMarketplaceAddress(address),
      });
    }
    return json(200, bundle, {
      // Content-addressed by `(author, persona, version)` — immutable.
      'cache-control': 'public, max-age=31536000, immutable',
    });
  }

  return null;
}
