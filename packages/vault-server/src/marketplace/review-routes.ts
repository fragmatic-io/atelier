// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace review HTTP routes — V-6.d.
 *
 * Two routes:
 *
 *   POST /marketplace/review/<author>/<persona>@<version>
 *     Body: `{ state, notes?, reviewer_id?, signature, public_key, key_id, timestamp }`.
 *     The `signature` covers the canonical JSON of `{ address, state,
 *     reviewer_id, notes, timestamp }` — same canonical-JSON encoder the
 *     publish path uses, just over a smaller envelope. The signature must
 *     verify against the `ReviewerKeyDirectory` entry for `reviewer_id`.
 *     200 on success (returns the persisted record), 400 on schema fail,
 *     401 on signature fail or unknown reviewer, 404 if no bundle exists
 *     at this address (we refuse to review non-existent bundles).
 *     `reviewed_at` is server-stamped — the client cannot influence it.
 *
 *   GET  /marketplace/review/<author>/<persona>@<version>
 *     Returns the `ReviewRecord` or 404 if no record exists.
 *
 * The route layer is a pure function `(req) => res | null`. Returning
 * `null` means "no review route matched" so the dispatcher can fall
 * through to other handlers.
 */
import { createPublicKey, verify as nodeVerify } from 'node:crypto';

import {
  ReviewStateSchema,
  canonicalJsonStringify,
  formatMarketplaceAddress,
  type MarketplaceAddress,
  type ReviewRecord,
  type ReviewState,
} from '@atelier/schemas';

import type { VaultRequest, VaultResponse } from '../server.js';
import { computeKeyId } from './key-directory.js';
import type { MarketplaceStore } from './store.js';
import type { ReviewStore, ReviewerKeyDirectory } from './review-store.js';

/** Route prefix this module owns. */
export const MARKETPLACE_REVIEW_PREFIX = '/marketplace/review';

/** JSON helper. */
function json(status: number, body: unknown, headers?: Record<string, string>): VaultResponse {
  if (headers !== undefined) return { status, body, headers };
  return { status, body };
}

/**
 * Pull `<author>/<persona>@<version>` out of a path of the form
 * `/marketplace/review/<author>/<persona>@<version>`. Returns null on
 * any malformed input.
 */
function parseReviewPath(
  path: string,
): { author: string; persona: string; version: string } | null {
  if (!path.startsWith(`${MARKETPLACE_REVIEW_PREFIX}/`)) return null;
  const rest = path.slice(MARKETPLACE_REVIEW_PREFIX.length + 1);
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

function decodeSegment(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/**
 * Canonical bytes a review signature covers. Pulled out as a named
 * export so the client + server agree on the input.
 *
 * Mirrors `signingInputForBundle` from `@atelier/schemas` but over a
 * review-specific envelope. The encoder is the same canonical-JSON
 * implementation so any third-party signer that already knows how to
 * sign a publish bundle can reuse the same primitive.
 */
export function signingInputForReview(input: {
  address: MarketplaceAddress;
  state: ReviewState;
  /** Free-form reviewer identifier. The directory lookup keys on this. */
  reviewer_id: string;
  /** Optional notes (omit from signing if absent — canonical encoder drops undefined). */
  notes?: string;
  /** ISO-8601 timestamp at sign time. */
  timestamp: string;
}): string {
  // Strip optional `signed_by` from the address before signing — same
  // policy publish takes (the pin is fetch-time, not part of the bundle).
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

/**
 * Verify a review signature against the reviewer's registered public
 * key. Pure function — extracted so tests can drive it without standing
 * up the route pipeline.
 */
export async function verifyReviewerSignature(
  envelope: {
    address: MarketplaceAddress;
    state: ReviewState;
    reviewer_id: string;
    notes?: string;
    timestamp: string;
    signature: string;
    public_key: string;
    key_id: string;
  },
  directory: ReviewerKeyDirectory,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const registered = await directory.get(envelope.reviewer_id);
  if (registered === undefined) {
    return { ok: false, reason: `unknown reviewer '${envelope.reviewer_id}'` };
  }
  if (registered.length !== 32) {
    return { ok: false, reason: 'registered public key is not 32 raw ed25519 bytes' };
  }

  const expectedKid = computeKeyId(registered);
  if (envelope.key_id !== expectedKid) {
    return {
      ok: false,
      reason: `key_id ${envelope.key_id} does not match registered key (${expectedKid})`,
    };
  }

  // SPKI-wrap the raw 32-byte point so node:crypto can import it.
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
    signatureBytes = Buffer.from(envelope.signature, 'base64');
  } catch {
    return { ok: false, reason: 'signature is not valid base64' };
  }

  const signingInputArgs: {
    address: MarketplaceAddress;
    state: ReviewState;
    reviewer_id: string;
    notes?: string;
    timestamp: string;
  } = {
    address: envelope.address,
    state: envelope.state,
    reviewer_id: envelope.reviewer_id,
    timestamp: envelope.timestamp,
  };
  if (envelope.notes !== undefined) signingInputArgs.notes = envelope.notes;
  const signingInput = signingInputForReview(signingInputArgs);
  const ok = nodeVerify(null, Buffer.from(signingInput, 'utf8'), publicKey, signatureBytes);
  if (!ok) return { ok: false, reason: 'bad signature' };
  return { ok: true };
}

/**
 * Match + handle a review request. Returns `null` when no route matches
 * so the caller falls through to other handlers.
 */
export async function handleMarketplaceReviewRequest(
  bundleStore: MarketplaceStore,
  reviewStore: ReviewStore,
  reviewerDirectory: ReviewerKeyDirectory,
  req: VaultRequest,
  now: () => string = () => new Date().toISOString(),
): Promise<VaultResponse | null> {
  if (!req.path.startsWith(`${MARKETPLACE_REVIEW_PREFIX}/`)) return null;

  const parsedPath = parseReviewPath(req.path);
  if (parsedPath === null) {
    return json(400, { error: 'malformed marketplace address in path' });
  }
  const address: MarketplaceAddress = {
    scheme: 'atelier',
    author: parsedPath.author,
    persona: parsedPath.persona,
    version: parsedPath.version,
  };

  // ---- GET /marketplace/review/<a>/<p>@<v> ----------------------------
  if (req.method === 'GET') {
    const record = await reviewStore.get(address);
    if (record === undefined) {
      return json(404, {
        error: 'no review record',
        address: formatMarketplaceAddress(address),
      });
    }
    return json(200, record);
  }

  // ---- POST /marketplace/review/<a>/<p>@<v> ---------------------------
  if (req.method === 'POST') {
    const body = req.body as {
      state?: unknown;
      reviewer_id?: unknown;
      notes?: unknown;
      timestamp?: unknown;
      signature?: unknown;
      public_key?: unknown;
      key_id?: unknown;
    } | null;
    if (body === null || typeof body !== 'object') {
      return json(400, { error: 'body must be a review envelope object' });
    }
    const stateParsed = ReviewStateSchema.safeParse(body.state);
    if (!stateParsed.success) {
      return json(400, { error: 'invalid or missing state' });
    }
    if (typeof body.reviewer_id !== 'string' || body.reviewer_id.length === 0) {
      return json(400, { error: 'reviewer_id is required' });
    }
    if (typeof body.timestamp !== 'string' || body.timestamp.length === 0) {
      return json(400, { error: 'timestamp is required' });
    }
    if (typeof body.signature !== 'string' || body.signature.length === 0) {
      return json(400, { error: 'signature is required' });
    }
    if (typeof body.public_key !== 'string' || body.public_key.length === 0) {
      return json(400, { error: 'public_key is required' });
    }
    if (typeof body.key_id !== 'string' || !/^[a-f0-9]{16}$/u.test(body.key_id)) {
      return json(400, { error: 'key_id must be a 16-char hex fingerprint' });
    }
    if (body.notes !== undefined && typeof body.notes !== 'string') {
      return json(400, { error: 'notes must be a string when present' });
    }

    // Refuse to review a non-existent bundle. Rationale: a review
    // record is meaningless if there's no payload to point at, and
    // surfacing 404 lets the CLI flag a typo immediately.
    const bundle = await bundleStore.get(address);
    if (bundle === undefined) {
      return json(404, {
        error: 'no bundle at this address',
        address: formatMarketplaceAddress(address),
      });
    }

    const verifyArgs: {
      address: MarketplaceAddress;
      state: ReviewState;
      reviewer_id: string;
      notes?: string;
      timestamp: string;
      signature: string;
      public_key: string;
      key_id: string;
    } = {
      address,
      state: stateParsed.data,
      reviewer_id: body.reviewer_id,
      timestamp: body.timestamp,
      signature: body.signature,
      public_key: body.public_key,
      key_id: body.key_id,
    };
    if (body.notes !== undefined) verifyArgs.notes = body.notes;
    const verify = await verifyReviewerSignature(verifyArgs, reviewerDirectory);
    if (!verify.ok) {
      return json(401, { error: 'signature verification failed', reason: verify.reason });
    }

    // Preserve `submitted_at` from the existing record (set at first
    // publish). If no record exists yet (e.g. the publish hook ran
    // outside this code path), fall back to the request timestamp —
    // documented behaviour in the route comment.
    const existing = await reviewStore.get(address);
    const submittedAt = existing?.submitted_at ?? body.timestamp;

    const record: ReviewRecord = {
      address,
      state: stateParsed.data,
      submitted_at: submittedAt,
      reviewed_at: now(),
      reviewer_id: body.reviewer_id,
    };
    if (body.notes !== undefined) record.notes = body.notes;

    await reviewStore.put(record);
    return json(200, record);
  }

  // Method not GET/POST on a review path — let the dispatcher fall through.
  return null;
}
