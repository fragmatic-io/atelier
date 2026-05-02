// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Marketplace primitives — Wave 8 / V-6.
 *
 * The `cir://` addressing scheme + the signed bundle that travels over the
 * wire. The marketplace pivot (Wave M) made the demos prove the marketplace
 * promise; V-6 makes the marketplace itself a real product surface. This
 * file fixes the SHAPE of that surface — addressing, signature envelope,
 * key-id derivation — so the vault server, vault client, and any future
 * third-party host can all speak to the same wire format.
 *
 * Companion docs: `/Users/vid/cir/docs/vault-protocol.md` §"Marketplace
 * endpoints" carries the wire spec; this file is the runtime validator.
 */
import { z } from 'zod';
import { SemverString } from './common.js';

/**
 * Bundle name — `lowercase-hyphen-or-dot-separated`. Matches the existing
 * identifier shape (capability / skill IDs) so a recipe can be addressed
 * the same way a capability is.
 */
const MarketplaceIdentifierRegex = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

/**
 * The author segment of a `cir://` address. Same shape as `UserId` /
 * `AppId`: the vault account the bundle is published from.
 */
export const MarketplaceAuthor = z
  .string()
  .regex(MarketplaceIdentifierRegex, 'Invalid marketplace author');
export type MarketplaceAuthor = z.infer<typeof MarketplaceAuthor>;

/** The persona/recipe/bundle name. */
export const MarketplacePersona = z
  .string()
  .regex(MarketplaceIdentifierRegex, 'Invalid marketplace persona');
export type MarketplacePersona = z.infer<typeof MarketplacePersona>;

/**
 * Parsed `cir://<author>/<persona>@<version>` address. The `scheme` is
 * literal so a single `MarketplaceAddress` cannot be confused with any
 * other URI shape the framework speaks.
 */
export const MarketplaceAddressSchema = z.object({
  scheme: z.literal('cir'),
  author: MarketplaceAuthor,
  persona: MarketplacePersona,
  version: SemverString,
  /**
   * Optional explicit key pinning. When the publisher rotates their signing
   * key but wants old links to keep resolving to the historical key, they
   * embed `?signed_by=<key_id>` on the URI. The fetcher honours it before
   * falling back to the TOFU cache.
   */
  signed_by: z
    .string()
    .regex(/^[a-f0-9]{16}$/u, 'signed_by must be a 16-char hex fingerprint')
    .optional(),
});
export type MarketplaceAddress = z.infer<typeof MarketplaceAddressSchema>;

/**
 * Short, deterministic fingerprint of an ed25519 public key — first 16 hex
 * chars of `sha256(public_key_bytes)`. Used for both the bundle's `key_id`
 * and the optional `?signed_by=` URI parameter.
 *
 * 16 hex chars = 64 bits of collision resistance. Sufficient for
 * trust-on-first-use against accidental rotation; not a substitute for the
 * full public key on adversarial verification (which uses the embedded
 * `public_key` field directly).
 */
export const MarketplaceKeyId = z
  .string()
  .regex(/^[a-f0-9]{16}$/u, 'key_id must be a 16-char hex fingerprint');
export type MarketplaceKeyId = z.infer<typeof MarketplaceKeyId>;

/**
 * The wire envelope a marketplace bundle travels in. `signature` covers the
 * canonical JSON of `{address, payload, timestamp}` (sorted-key serialise);
 * `public_key` is the verifier-convenience copy of the author's key bytes,
 * and `key_id` is its short fingerprint (the TOFU cache stores fingerprints,
 * not raw keys).
 *
 * The `payload` is intentionally `unknown` — the marketplace transports
 * recipes, persona bundles, and capability sets through the same envelope.
 * Per-payload schemas validate downstream.
 */
export const SignedBundleSchema = z.object({
  address: MarketplaceAddressSchema,
  payload: z.unknown(),
  /** ISO-8601 UTC timestamp at the moment of signing. */
  timestamp: z.string().datetime({ offset: true }),
  /** Base64 ed25519 signature over canonical JSON of {address,payload,timestamp}. */
  signature: z.string().min(1),
  /** Base64 ed25519 public key (raw 32-byte point). */
  public_key: z.string().min(1),
  /** Short fingerprint of public_key. */
  key_id: MarketplaceKeyId,
});
export type SignedBundle = z.infer<typeof SignedBundleSchema>;

/**
 * Parse a `cir://<author>/<persona>@<version>[?signed_by=<key_id>]` URI
 * into a `MarketplaceAddress`. Returns `null` on any malformed input —
 * callers map to a 400.
 *
 * Why a hand-rolled parser rather than `new URL(...)`: the WHATWG URL
 * parser swallows the `@version` suffix into either the userinfo or the
 * path depending on placement, neither of which produces a useful split.
 * The grammar is small enough that a focused regex is easier to audit.
 */
const CIR_URI_REGEX =
  /^cir:\/\/([a-z0-9][a-z0-9._-]{0,127})\/([a-z0-9][a-z0-9._-]{0,127})@(\S+?)(?:\?(.+))?$/u;

export function parseMarketplaceAddress(uri: string): MarketplaceAddress | null {
  const match = CIR_URI_REGEX.exec(uri);
  if (match === null) return null;
  const [, author, persona, version, queryRaw] = match as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
  ];
  // Validate the version eagerly so a malformed semver short-circuits before
  // we ever construct an address object.
  const versionResult = SemverString.safeParse(version);
  if (!versionResult.success) return null;

  let signedBy: string | undefined;
  if (queryRaw !== undefined) {
    for (const pair of queryRaw.split('&')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const k = pair.slice(0, eq);
      const v = pair.slice(eq + 1);
      if (k === 'signed_by') signedBy = v;
    }
    if (signedBy !== undefined && !/^[a-f0-9]{16}$/u.test(signedBy)) return null;
  }

  const address: MarketplaceAddress = {
    scheme: 'cir',
    author,
    persona,
    version: versionResult.data,
  };
  if (signedBy !== undefined) address.signed_by = signedBy;
  return address;
}

/** Render a `MarketplaceAddress` back into its canonical `cir://` string form. */
export function formatMarketplaceAddress(address: MarketplaceAddress): string {
  const base = `cir://${address.author}/${address.persona}@${address.version}`;
  if (address.signed_by !== undefined) {
    return `${base}?signed_by=${address.signed_by}`;
  }
  return base;
}

/**
 * Canonical JSON encoder — JSON with sorted object keys at every depth.
 *
 * Why hand-rolled: `JSON.stringify` does not guarantee key order across
 * engines (it does in practice today, but the spec doesn't pin it). A
 * deterministic encoder makes the signature stable regardless of how the
 * publisher constructed their object literal. We avoid pulling in a heavy
 * `json-stable-stringify` dep — the implementation is small enough to live
 * in this file and be audited inline.
 *
 * Behaviour:
 *   - Object keys are emitted in lexicographic order.
 *   - Arrays preserve order (the index IS the key).
 *   - `undefined`, functions, and symbols match `JSON.stringify`'s behaviour:
 *     they are omitted as object values and stringified as `null` in arrays.
 *   - `NaN` / `Infinity` are emitted as `null` (same as `JSON.stringify`).
 */
export function canonicalJsonStringify(value: unknown): string {
  return canonicalEncode(value);
}

function canonicalEncode(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts: string[] = value.map((v) => {
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return 'null';
      return canonicalEncode(v);
    });
    return `[${parts.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
      parts.push(`${JSON.stringify(k)}:${canonicalEncode(v)}`);
    }
    return `{${parts.join(',')}}`;
  }
  // undefined, function, symbol — match JSON.stringify (returns undefined at
  // the top level). We can't return undefined from a string-typed function;
  // emit 'null' to keep the encoder total.
  return 'null';
}

/**
 * The exact bytes a signature covers — `canonicalJsonStringify({address,
 * payload, timestamp})` UTF-8 encoded. Pulled out as a named export so the
 * server, the client, and any third-party signer all agree on the input.
 */
export function signingInputForBundle(input: {
  address: MarketplaceAddress;
  payload: unknown;
  timestamp: string;
}): string {
  // Strip the optional `signed_by` from the address before signing — it's a
  // fetch-time pin, not a property of the bundle. Two addresses that differ
  // only in `signed_by` should produce the SAME bundle bytes.
  const addressForSigning: MarketplaceAddress = {
    scheme: 'cir',
    author: input.address.author,
    persona: input.address.persona,
    version: input.address.version,
  };
  return canonicalJsonStringify({
    address: addressForSigning,
    payload: input.payload,
    timestamp: input.timestamp,
  });
}
