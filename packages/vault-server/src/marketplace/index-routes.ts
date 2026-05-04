// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace browse-index HTTP route — V-6.d.
 *
 *   GET /marketplace/index
 *     Returns the curated browse index — the list of bundles whose latest
 *     review state is `approved`. Optional query params:
 *
 *       ?author=<id>       — filter by author handle.
 *       ?domain=<id>       — filter by `payload.domain`.
 *       ?brandKitId=<id>   — filter by `payload.brand_kit_id` /
 *                            `payload.brandKitId` (we accept either).
 *       ?search=<query>    — case-insensitive substring across persona,
 *                            description, authorDisplayName.
 *       ?limit=<n>         — clamp to first n results.
 *       ?offset=<n>        — skip first n results.
 *       ?include=<states>  — comma-separated escape hatch for maintainers.
 *                            Each value must be a valid `ReviewState`. The
 *                            default index is `approved`-only; passing
 *                            `?include=pending` adds pending bundles to
 *                            the response, etc. Pass `approved` explicitly
 *                            alongside other states to keep them visible
 *                            (the default is replaced when `include` is
 *                            specified).
 *
 * The response is `MarketplaceListing[]` — same shape the
 * `<MarketplaceBrowser>` component (V-6.c) consumes.
 */
import {
  ReviewStateSchema,
  formatMarketplaceAddress,
  type MarketplaceAddress,
  type ReviewState,
} from '@atelier/schemas';

import type { VaultRequest, VaultResponse } from '../server.js';
import type { MarketplaceStore } from './store.js';
import type { ReviewStore } from './review-store.js';

/** Route prefix this module owns. */
export const MARKETPLACE_INDEX_PATH = '/marketplace/index';

/**
 * Wire shape returned by `/marketplace/index`. Mirrors the
 * `MarketplaceListing` interface in `@atelier/components` and
 * `@atelier/vault-client` (both packages keep an inline structural copy
 * — see V-6.c for the rationale).
 */
export interface MarketplaceListingWire {
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
  /**
   * Review state at the time of the index query. Always present on
   * indexed rows. Hosts can use this to surface a "pending" pill in the
   * maintainer view.
   */
  reviewState: ReviewState;
}

/**
 * Read a `payload`-bag for the listing-shape fields. The bundle's
 * payload is intentionally `unknown` (recipes / personas / capability
 * sets all share the envelope), but the marketplace index needs a few
 * conventional keys to surface in the browse UI:
 *
 *   - `description`         (string)
 *   - `domain`              (string)
 *   - `brand_kit_id` /
 *     `brandKitId`          (string — accept either snake or camel)
 *   - `author_display_name` /
 *     `authorDisplayName`   (string — same rationale)
 *
 * Missing keys → undefined; the listing still renders, just without the
 * decoration. Hosts that want stricter shape can layer their own
 * payload-schema check on top.
 */
function readPayloadHints(payload: unknown): {
  description: string;
  domain?: string;
  brandKitId?: string;
  authorDisplayName?: string;
} {
  if (payload === null || typeof payload !== 'object') {
    return { description: '' };
  }
  const obj = payload as Record<string, unknown>;
  const description = typeof obj['description'] === 'string' ? obj['description'] : '';
  const out: {
    description: string;
    domain?: string;
    brandKitId?: string;
    authorDisplayName?: string;
  } = { description };
  if (typeof obj['domain'] === 'string') out.domain = obj['domain'];
  const brand = obj['brand_kit_id'] ?? obj['brandKitId'];
  if (typeof brand === 'string') out.brandKitId = brand;
  const display = obj['author_display_name'] ?? obj['authorDisplayName'];
  if (typeof display === 'string') out.authorDisplayName = display;
  return out;
}

/** Parse `?include=` into the set of states the response should include. */
function parseIncludeStates(query: Record<string, string>): ReadonlySet<ReviewState> {
  const raw = query['include'];
  if (raw === undefined || raw === '') {
    // Default index — approved only.
    return new Set<ReviewState>(['approved']);
  }
  const out = new Set<ReviewState>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const parsed = ReviewStateSchema.safeParse(trimmed);
    if (parsed.success) out.add(parsed.data);
  }
  // If the caller passed `?include=` but every value was invalid, fall
  // back to the default rather than returning an empty index — that's
  // less surprising than silently 200ing an empty list.
  if (out.size === 0) return new Set<ReviewState>(['approved']);
  return out;
}

function clampInt(raw: string | undefined, defaultValue: number, min = 0, max = 1000): number {
  if (raw === undefined) return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(Math.max(n, min), max);
}

/** JSON helper. */
function json(status: number, body: unknown): VaultResponse {
  return { status, body };
}

/**
 * Match + handle the index request. Returns `null` when no route matches.
 */
export async function handleMarketplaceIndexRequest(
  bundleStore: MarketplaceStore,
  reviewStore: ReviewStore,
  req: VaultRequest,
): Promise<VaultResponse | null> {
  if (req.path !== MARKETPLACE_INDEX_PATH || req.method !== 'GET') return null;

  const includeStates = parseIncludeStates(req.query);
  const records = await reviewStore.list();
  const authorFilter = (req.query['author'] ?? '').toLowerCase();
  const domainFilter = (req.query['domain'] ?? '').toLowerCase();
  const brandFilter = (req.query['brandKitId'] ?? '').toLowerCase();
  const search = (req.query['search'] ?? '').toLowerCase();
  const limit = clampInt(req.query['limit'], Number.MAX_SAFE_INTEGER, 1, 1000);
  const offset = clampInt(req.query['offset'], 0, 0, 1_000_000);

  const listings: MarketplaceListingWire[] = [];
  for (const record of records) {
    if (!includeStates.has(record.state)) continue;
    if (authorFilter !== '' && record.address.author.toLowerCase() !== authorFilter) continue;

    // Need the bundle to read description / domain / brand-kit / display
    // name. If the bundle disappeared (shouldn't, but defensively) skip.
    const bundle = await bundleStore.get(record.address);
    if (bundle === undefined) continue;
    const hints = readPayloadHints(bundle.payload);

    if (domainFilter !== '' && (hints.domain ?? '').toLowerCase() !== domainFilter) continue;
    if (brandFilter !== '' && (hints.brandKitId ?? '').toLowerCase() !== brandFilter) continue;

    if (search !== '') {
      const haystack =
        `${record.address.persona} ${hints.description} ${hints.authorDisplayName ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) continue;
    }

    const listing: MarketplaceListingWire = {
      address: addressForWire(record.address),
      description: hints.description,
      publishedAt: bundle.timestamp,
      reviewState: record.state,
    };
    if (hints.domain !== undefined) listing.domain = hints.domain;
    if (hints.brandKitId !== undefined) listing.brandKitId = hints.brandKitId;
    if (hints.authorDisplayName !== undefined) listing.authorDisplayName = hints.authorDisplayName;
    listings.push(listing);
  }

  // Stable ordering: newest publishedAt first, ties broken by raw address.
  listings.sort((a, b) => {
    if (a.publishedAt > b.publishedAt) return -1;
    if (a.publishedAt < b.publishedAt) return 1;
    return a.address.raw.localeCompare(b.address.raw);
  });

  const sliced = listings.slice(offset, offset + limit);
  return json(200, sliced);
}

function addressForWire(address: MarketplaceAddress): MarketplaceListingWire['address'] {
  return {
    scheme: 'atelier',
    author: address.author,
    persona: address.persona,
    version: address.version,
    raw: formatMarketplaceAddress({
      scheme: 'atelier',
      author: address.author,
      persona: address.persona,
      version: address.version,
    }),
  };
}
