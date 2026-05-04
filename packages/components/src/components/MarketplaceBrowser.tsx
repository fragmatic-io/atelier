// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 8 / V-6.c — `<MarketplaceBrowser>` baseline primitive.
 *
 * The vault marketplace's browse surface (the V-6 distribution channel —
 * NOT to be confused with "the catalog", which is the set of baseline
 * primitives `@atelier/components` ships and is what the Wave M
 * "baseline-first" pivot is about; see `TODO.md` §"Naming note").
 *
 * The component lists / filters / previews recipes published to a vault
 * marketplace. It is host-driven: the host wires a concrete
 * `MarketplaceClient` (typically the `@atelier/vault-client`'s class) and
 * `<MarketplaceBrowser>` calls `client.list(query)` on mount + on every
 * filter change. Search input is debounced ~200 ms.
 *
 * The `MarketplaceAddress` shape is **structurally mirrored** from
 * `@atelier/schemas` — keeping `@atelier/components` free of a runtime
 * dependency on schemas is the same pattern Cnt-10 / AI-1 / V-6.b followed
 * for other cross-package mirrors. Hosts can pass a schemas-typed
 * `MarketplaceAddress` straight in.
 *
 * Behaviour notes:
 *
 *  - **Two-pane layout.** Left filter panel (author / domain / brand-kit /
 *    search input); right scrollable listings panel.
 *  - **Listing card.** Persona name (large), version pill, author display
 *    name, description (truncated to 2 lines), domain + brand-kit chips.
 *  - **Card click → preview drawer** with the full description + a "Use
 *    this recipe" CTA. The CTA fires `onSelect(listing)` and (when
 *    `selectCapability` is supplied) dispatches the capability with
 *    `{ address }` via the host-supplied `dispatcher` (mirrors the
 *    DropZone / SelectionActionBar contract).
 *  - **Loading + empty states** use baseline primitives — `<Skeleton
 *    shape="card" count={6}>` while the first list call is in flight,
 *    `<EmptyState>` when the client returns zero matches.
 *  - **Keyboard.** ↑/↓ navigates the focused listing; Enter selects
 *    (opens the preview drawer). Tab order respects normal DOM order so
 *    keyboard-only users can also move from the filter panel into the
 *    list.
 *  - **ARIA.** Root carries `role="region"` + `aria-label="Atelier
 *    marketplace"`. The list has `role="list"` with each card as
 *    `role="listitem"` — no fancy combobox semantics; the dialog opens
 *    via Enter / click.
 *
 * Composition rule: `MarketplaceBrowser: { can_contain: 'leaf' }` — content
 * is prop-driven (the listings come from `client.list()`); manifest
 * authors do not embed children inside it.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';
import { EmptyState } from './EmptyState.js';
import { Skeleton } from './Skeleton.js';

/**
 * Structural mirror of `@atelier/schemas`'s `MarketplaceAddress`. Kept
 * inline so this package stays free of a runtime dep on schemas — the
 * same trick Cnt-10 / AI-1 used for shared cross-package shapes.
 *
 * Hosts can pass a schemas-typed value straight in: TypeScript treats the
 * two as structurally identical.
 */
export interface MarketplaceAddress {
  /** Always `'atelier'` per the URI grammar. */
  scheme: 'atelier';
  /** Author handle (e.g. `'acme'`). */
  author: string;
  /** Persona slug (e.g. `'founder-inbox'`). */
  persona: string;
  /** Semver version (e.g. `'1.0.0'`). */
  version: string;
  /** The full canonical URI string (`'atelier://acme/founder-inbox@1.0.0'`). */
  raw: string;
}

/** Filter shape passed to `client.list(query)`. */
export interface MarketplaceListQuery {
  author?: string;
  domain?: string;
  brandKitId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Review-state surfaced on listing cards. Mirrors the V-6.d
 * `ReviewState` enum from `@atelier/schemas` without taking a runtime
 * dep. Hosts that wire the real review pipeline can pass the
 * schemas-typed value straight through.
 */
export type MarketplaceReviewState = 'pending' | 'approved' | 'rejected' | 'flagged';

/** Single result item returned by the marketplace client. */
export interface MarketplaceListing {
  address: MarketplaceAddress;
  description: string;
  domain?: string;
  brandKitId?: string;
  /** ISO datetime of the publish event. */
  publishedAt: string;
  authorDisplayName?: string;
  /**
   * V-6.d — optional review state surfaced as a small pill on the
   * listing card. The default is `approved` (and `approved` listings do
   * NOT render a pill — showing one on every card is noise). Hosts wire
   * this from the marketplace index response.
   */
  reviewState?: MarketplaceReviewState;
}

/**
 * The async client `<MarketplaceBrowser>` queries. Mirrors a subset of
 * `@atelier/vault-client`'s shape — the host wires the concrete
 * implementation. `list()` is the primary surface; `get()` is exposed for
 * preview / pin flows but the browser does not call it itself today.
 *
 * V-6.d adds an OPTIONAL `reviewState(address)` method that hosts can
 * implement to surface the per-address curated state. The browser
 * doesn't call it today — the listing's `reviewState` field is the
 * primary surface — but the extension point is reserved so a future
 * iteration (e.g. a "request review" CTA) has a place to land.
 */
export interface MarketplaceClient {
  list(query?: MarketplaceListQuery): Promise<MarketplaceListing[]>;
  get(address: MarketplaceAddress): Promise<MarketplaceListing | null>;
  /**
   * Optional. Look up the review state for an address. Hosts opt in;
   * `<MarketplaceBrowser>` treats undefined/missing as "no state info".
   */
  reviewState?(address: MarketplaceAddress): Promise<MarketplaceReviewState | undefined>;
}

/**
 * Dispatcher signature accepted by `<MarketplaceBrowser>`. Mirrors the
 * `DispatchFn` type from `@atelier/react`'s `useDispatcher()` hook so the
 * two are structurally interchangeable; the components package keeps zero
 * runtime dependency on `@atelier/react`.
 */
export type MarketplaceBrowserDispatcher = (
  capabilityId: string,
  input: unknown,
) => Promise<unknown>;

export interface MarketplaceBrowserProps {
  /** Host-supplied marketplace client (typically `@atelier/vault-client`). */
  client: MarketplaceClient;
  /** Initial filter state. */
  initialQuery?: MarketplaceListQuery;
  /** Called when the user picks a listing (e.g. to install / preview). */
  onSelect?: (listing: MarketplaceListing) => void;
  /** Optional capability dispatched on select. Receives `{ address }`. */
  selectCapability?: string;
  /** Host-supplied dispatcher (same shape as DropZone / SelectionActionBar). */
  dispatcher?: MarketplaceBrowserDispatcher;
  /** Debounce window for the search input, ms. Default 200. */
  debounceMs?: number;
  className?: string;
}

/** Default debounce window for the search input. */
export const MARKETPLACE_BROWSER_DEFAULT_DEBOUNCE_MS = 200;

/** ARIA region label. Exported so hosts can re-use for breadcrumbs etc. */
export const MARKETPLACE_BROWSER_REGION_LABEL = 'Atelier marketplace';

/**
 * `MockMarketplaceClient` — host-side preview helper. Holds an in-memory
 * array of listings and applies the filter / search predicate locally.
 * Useful for docs-site previews + unit tests; production hosts wire the
 * real `@atelier/vault-client`.
 */
export class MockMarketplaceClient implements MarketplaceClient {
  private readonly listings: readonly MarketplaceListing[];

  constructor(listings: readonly MarketplaceListing[]) {
    this.listings = listings;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async list(query?: MarketplaceListQuery): Promise<MarketplaceListing[]> {
    let out = this.listings.slice();
    if (query?.author !== undefined && query.author !== '') {
      const author = query.author.toLowerCase();
      out = out.filter((l) => l.address.author.toLowerCase() === author);
    }
    if (query?.domain !== undefined && query.domain !== '') {
      const domain = query.domain.toLowerCase();
      out = out.filter((l) => (l.domain ?? '').toLowerCase() === domain);
    }
    if (query?.brandKitId !== undefined && query.brandKitId !== '') {
      const id = query.brandKitId.toLowerCase();
      out = out.filter((l) => (l.brandKitId ?? '').toLowerCase() === id);
    }
    if (query?.search !== undefined && query.search !== '') {
      const needle = query.search.toLowerCase();
      out = out.filter(
        (l) =>
          l.address.persona.toLowerCase().includes(needle) ||
          l.description.toLowerCase().includes(needle) ||
          (l.authorDisplayName ?? '').toLowerCase().includes(needle),
      );
    }
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? out.length;
    return out.slice(offset, offset + limit);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async get(address: MarketplaceAddress): Promise<MarketplaceListing | null> {
    const found = this.listings.find((l) => l.address.raw === address.raw);
    return found ?? null;
  }
}

/**
 * Truncate `text` so the browser can clamp to two lines without depending
 * on `-webkit-line-clamp`. The cutoff is intentionally conservative — the
 * card has a fixed width in the two-pane layout and 220 chars / ~2 lines
 * is the empirical fit on a 16px base size.
 */
const DESCRIPTION_CLAMP = 220;

function clampDescription(text: string): string {
  if (text.length <= DESCRIPTION_CLAMP) return text;
  return `${text.slice(0, DESCRIPTION_CLAMP - 1).trimEnd()}…`;
}

/** Produce a stable address-key for the listing list. */
function keyFor(listing: MarketplaceListing): string {
  return listing.address.raw;
}

/**
 * Tailwind class set for a review-state pill. `approved` does not render
 * a pill (caller short-circuits) so it is intentionally absent here.
 */
function reviewStatePillClass(state: MarketplaceReviewState): string {
  switch (state) {
    case 'pending':
      return 'bg-yellow-50 text-yellow-900';
    case 'rejected':
      return 'bg-red-50 text-red-900';
    case 'flagged':
      return 'bg-orange-50 text-orange-900';
    default:
      // `approved` (or any future state) — fall back to neutral gray.
      return 'bg-gray-100 text-gray-700';
  }
}

export function MarketplaceBrowser({
  client,
  initialQuery,
  onSelect,
  selectCapability,
  dispatcher,
  debounceMs = MARKETPLACE_BROWSER_DEFAULT_DEBOUNCE_MS,
  className,
}: MarketplaceBrowserProps): ReactNode {
  const regionLabelId = useId();

  // Filter state. Search is mirrored separately from the committed query
  // so the input can update live while we debounce the actual `list()` call.
  const [author, setAuthor] = useState<string>(initialQuery?.author ?? '');
  const [domain, setDomain] = useState<string>(initialQuery?.domain ?? '');
  const [brandKitId, setBrandKitId] = useState<string>(initialQuery?.brandKitId ?? '');
  const [searchInput, setSearchInput] = useState<string>(initialQuery?.search ?? '');
  const [committedSearch, setCommittedSearch] = useState<string>(initialQuery?.search ?? '');

  // Result state. We keep `loading` as a true initial-load flag so the
  // skeleton only appears on the first call (and after a host-triggered
  // re-mount); subsequent filter changes preserve the previously-rendered
  // listings to avoid a janky placeholder flash on every keystroke.
  const [listings, setListings] = useState<readonly MarketplaceListing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [highlight, setHighlight] = useState<number>(0);

  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewListing, setPreviewListing] = useState<MarketplaceListing | null>(null);

  // Debounce the search input → committedSearch.
  useEffect(() => {
    if (searchInput === committedSearch) return;
    const t = setTimeout(
      () => {
        setCommittedSearch(searchInput);
      },
      Math.max(0, debounceMs),
    );
    return () => {
      clearTimeout(t);
    };
  }, [searchInput, committedSearch, debounceMs]);

  // The committed query — sent to `client.list()` on every change.
  const query: MarketplaceListQuery = useMemo(() => {
    const q: MarketplaceListQuery = {};
    if (author !== '') q.author = author;
    if (domain !== '') q.domain = domain;
    if (brandKitId !== '') q.brandKitId = brandKitId;
    if (committedSearch !== '') q.search = committedSearch;
    if (initialQuery?.limit !== undefined) q.limit = initialQuery.limit;
    if (initialQuery?.offset !== undefined) q.offset = initialQuery.offset;
    return q;
  }, [author, domain, brandKitId, committedSearch, initialQuery?.limit, initialQuery?.offset]);

  // Track whether this is the very first list() — the skeleton only shows
  // on the initial load. Refilter calls land on top of the previous list.
  const firstLoadRef = useRef<boolean>(true);

  // Cancellation token: if a new list() lands while a previous one is
  // still in flight, ignore the older response.
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    const myId = requestIdRef.current + 1;
    requestIdRef.current = myId;
    if (firstLoadRef.current) setLoading(true);
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const result = await client.list(query);
        if (cancelled) return;
        if (requestIdRef.current !== myId) return;
        setListings(result);
        setHighlight((h) => (result.length === 0 ? 0 : Math.min(h, result.length - 1)));
      } catch {
        // The browser is best-effort: a transient client error leaves the
        // previous listings on screen. Hosts that want stronger error UX
        // can wrap the client themselves.
        if (cancelled) return;
        if (requestIdRef.current !== myId) return;
        setListings([]);
      } finally {
        if (!cancelled && requestIdRef.current === myId) {
          setLoading(false);
          firstLoadRef.current = false;
        }
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [client, query]);

  // -- Card selection ------------------------------------------------------
  const openPreview = useCallback((listing: MarketplaceListing): void => {
    setPreviewListing(listing);
    setPreviewOpen(true);
  }, []);

  const closePreview = useCallback((): void => {
    setPreviewOpen(false);
  }, []);

  const handleUseRecipe = useCallback((): void => {
    if (previewListing === null) return;
    onSelect?.(previewListing);
    if (selectCapability !== undefined && dispatcher !== undefined) {
      void dispatcher(selectCapability, { address: previewListing.address });
    }
    setPreviewOpen(false);
  }, [previewListing, onSelect, selectCapability, dispatcher]);

  // -- Keyboard navigation -------------------------------------------------
  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>): void => {
    if (listings.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % listings.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + listings.length) % listings.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = listings[highlight];
      if (item) openPreview(item);
    }
  };

  // -- Render --------------------------------------------------------------
  const showSkeleton = loading && listings.length === 0;
  const showEmpty = !loading && listings.length === 0;

  return (
    <div
      role="region"
      aria-label={MARKETPLACE_BROWSER_REGION_LABEL}
      data-cir-component="MarketplaceBrowser"
      className={cn('flex flex-row gap-4', className)}
    >
      {/* ---- Filter panel -------------------------------------------- */}
      <aside
        data-cir-part="marketplace-filters"
        aria-label="Marketplace filters"
        className={cn('flex flex-col gap-3 w-56 shrink-0')}
      >
        <FilterField
          id={`${regionLabelId}-author`}
          label="Author"
          value={author}
          onChange={setAuthor}
          placeholder="Any author"
        />
        <FilterField
          id={`${regionLabelId}-domain`}
          label="Domain"
          value={domain}
          onChange={setDomain}
          placeholder="Any domain"
        />
        <FilterField
          id={`${regionLabelId}-brand-kit`}
          label="Brand kit"
          value={brandKitId}
          onChange={setBrandKitId}
          placeholder="Any brand kit"
        />
        <FilterField
          id={`${regionLabelId}-search`}
          label="Search"
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search recipes…"
          type="search"
        />
      </aside>

      {/* ---- Listings panel ------------------------------------------ */}
      <div data-cir-part="marketplace-listings" className={cn('flex-1 min-w-0')}>
        {showSkeleton ? (
          <div data-cir-part="marketplace-loading">
            <Skeleton shape="card" count={6} />
          </div>
        ) : showEmpty ? (
          <EmptyState
            title="No recipes found"
            description="Try clearing a filter or broadening your search."
          />
        ) : (
          <ul
            role="list"
            aria-label="Marketplace listings"
            data-cir-part="marketplace-list"
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className={cn('flex flex-col gap-3 overflow-y-auto')}
          >
            {listings.map((listing, idx) => {
              const highlighted = idx === highlight;
              return (
                <li
                  key={keyFor(listing)}
                  role="listitem"
                  data-cir-part="marketplace-card"
                  data-cir-address={listing.address.raw}
                  data-highlighted={highlighted ? 'true' : 'false'}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setHighlight(idx);
                      openPreview(listing);
                    }}
                    onMouseEnter={() => {
                      setHighlight(idx);
                    }}
                    className={cn('flex flex-col gap-2 text-left w-full p-3 rounded-md')}
                    data-cir-part="marketplace-card-button"
                  >
                    <div
                      data-cir-part="marketplace-card-header"
                      className={cn('flex items-baseline gap-2 flex-wrap')}
                    >
                      <span
                        data-cir-part="marketplace-card-persona"
                        className={cn('text-base font-semibold')}
                      >
                        {listing.address.persona}
                      </span>
                      <span
                        data-cir-part="marketplace-card-version"
                        className={cn('text-xs px-1.5 py-0.5 rounded-full bg-gray-100')}
                      >
                        v{listing.address.version}
                      </span>
                      {listing.reviewState !== undefined && listing.reviewState !== 'approved' ? (
                        <span
                          data-cir-part="marketplace-card-review-state"
                          data-review-state={listing.reviewState}
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full',
                            reviewStatePillClass(listing.reviewState),
                          )}
                        >
                          {listing.reviewState}
                        </span>
                      ) : null}
                      {listing.authorDisplayName !== undefined ? (
                        <span
                          data-cir-part="marketplace-card-author"
                          className={cn('text-xs text-gray-600')}
                        >
                          by {listing.authorDisplayName}
                        </span>
                      ) : (
                        <span
                          data-cir-part="marketplace-card-author"
                          className={cn('text-xs text-gray-600')}
                        >
                          by {listing.address.author}
                        </span>
                      )}
                    </div>
                    <p
                      data-cir-part="marketplace-card-description"
                      className={cn('text-sm text-gray-700')}
                    >
                      {clampDescription(listing.description)}
                    </p>
                    <div
                      data-cir-part="marketplace-card-chips"
                      className={cn('flex gap-2 flex-wrap')}
                    >
                      {listing.domain !== undefined ? (
                        <span
                          data-cir-part="marketplace-card-chip"
                          data-chip-kind="domain"
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-900',
                          )}
                        >
                          {listing.domain}
                        </span>
                      ) : null}
                      {listing.brandKitId !== undefined ? (
                        <span
                          data-cir-part="marketplace-card-chip"
                          data-chip-kind="brand-kit"
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-900',
                          )}
                        >
                          {listing.brandKitId}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---- Preview drawer ------------------------------------------ */}
      {previewOpen && previewListing !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewListing.address.persona}`}
          data-cir-part="marketplace-preview"
          data-cir-address={previewListing.address.raw}
          className={cn('fixed inset-y-0 right-0 w-96 bg-white shadow-lg z-50 p-4')}
        >
          <header
            data-cir-part="marketplace-preview-header"
            className={cn('flex items-baseline gap-2 flex-wrap')}
          >
            <h2 className={cn('text-lg font-semibold')}>{previewListing.address.persona}</h2>
            <span
              data-cir-part="marketplace-preview-version"
              className={cn('text-xs px-1.5 py-0.5 rounded-full bg-gray-100')}
            >
              v{previewListing.address.version}
            </span>
          </header>
          <p
            data-cir-part="marketplace-preview-author"
            className={cn('text-xs text-gray-600 mt-1')}
          >
            by {previewListing.authorDisplayName ?? previewListing.address.author}
          </p>
          <p
            data-cir-part="marketplace-preview-description"
            className={cn('text-sm text-gray-800 mt-3 whitespace-pre-wrap')}
          >
            {previewListing.description}
          </p>
          <div data-cir-part="marketplace-preview-actions" className={cn('flex gap-2 mt-4')}>
            <button
              type="button"
              onClick={handleUseRecipe}
              data-cir-part="marketplace-preview-use"
              className={cn('px-3 py-1.5 rounded-md bg-blue-600 text-white')}
            >
              Use this recipe
            </button>
            <button
              type="button"
              onClick={closePreview}
              data-cir-part="marketplace-preview-close"
              className={cn('px-3 py-1.5 rounded-md bg-gray-100 text-gray-900')}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
MarketplaceBrowser.displayName = 'MarketplaceBrowser';

/** Local input component used by the filter panel. */
function FilterField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'search';
}): ReactNode {
  return (
    <div data-cir-part="marketplace-filter-field" className={cn('flex flex-col gap-1')}>
      <label htmlFor={id} className={cn('text-xs text-gray-600')}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onChange(e.currentTarget.value);
        }}
        data-cir-part="marketplace-filter-input"
        className={cn('px-2 py-1 rounded-md border border-gray-200 text-sm')}
      />
    </div>
  );
}

export function marketplaceBrowserTextRender(props: MarketplaceBrowserProps): string {
  const init = props.initialQuery;
  if (init?.search !== undefined && init.search !== '') {
    return `[MarketplaceBrowser: search "${init.search}"]`;
  }
  if (init?.author !== undefined && init.author !== '') {
    return `[MarketplaceBrowser: author ${init.author}]`;
  }
  return '[MarketplaceBrowser]';
}

export const MarketplaceBrowserBinding: ComponentBinding = {
  id: 'MarketplaceBrowser',
  factory: MarketplaceBrowser as ComponentBinding['factory'],
};
