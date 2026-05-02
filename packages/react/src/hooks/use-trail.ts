// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useTrail()` — Wave 11 / Nav-4.
 *
 * Stateful drilldown-breadcrumb trail. Pairs with `<Breadcrumb trail={…}>`
 * from `@atelier/components`. The hook owns a `TrailSegment[]` and (when
 * opted in) keeps it in sync with a `?_trail=…` URL query parameter so the
 * trail survives reload + share.
 *
 * Why duplicate `TrailSegment` here?
 * ----------------------------------
 * The canonical type lives in `@atelier/components/breadcrumb/trail.ts`
 * alongside the visual `<Breadcrumb>`. `@atelier/react` deliberately does
 * NOT take a runtime dependency on `@atelier/components` (mirrors the
 * `useUndoToastEmitter` precedent — pulling components would drag in
 * `lucide-react`, `react-markdown`, etc. for every adapter consumer).
 *
 * Both definitions are structural-type-compatible — TypeScript treats
 * `{label, id?, href?}` and `{label, id?, href?}` as the same shape, so
 * passing a `TrailSegment` from this hook to a `<Breadcrumb trail={…}>`
 * import from `@atelier/components` typechecks and round-trips.
 *
 * SSR contract
 * ------------
 * On the server (no `window`) the hook returns the `initialTrail` (or
 * empty); the URL sync no-ops. Hydration on the client kicks
 * `parseTrail(window.location.search)` into effect so the route renders
 * correctly without a layout-shift flash.
 *
 * URL update strategy
 * -------------------
 * `window.history.replaceState` (NOT `pushState`) — drilldown navigation
 * should update the URL in place rather than spam the back-button stack.
 * Hosts that want push semantics call `setTrail` themselves and update the
 * URL via their router.
 *
 * Atelier never imports a router (Next.js / React Router) — the host owns
 * the route. This hook owns the trail shape + the `?_trail=` query slot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Structural mirror of `TrailSegment` from `@atelier/components/breadcrumb`.
 * Defined here too so the React adapter stays free of a runtime dep on
 * `@atelier/components`. Cross-package usage is type-compatible by shape.
 */
export interface TrailSegment {
  label: string;
  id?: string;
  href?: string;
}

const SEG_SEP = '|';
const ID_SEP = '_';

// Both delimiters are RFC-3986-unreserved (encodeURIComponent leaves them
// alone). We hand-escape them so the structural `_` between label and id
// is unambiguous even when ids legitimately contain `_` (e.g. `ch_xxx`).
function escapePart(s: string): string {
  return encodeURIComponent(s).replace(/_/g, '%5F').replace(/\|/g, '%7C');
}

/** Mirror of `serializeTrail` from `@atelier/components/breadcrumb`. */
function serializeTrail(trail: readonly TrailSegment[]): string {
  if (trail.length === 0) return '';
  return trail
    .map((seg) => {
      const label = escapePart(seg.label);
      if (seg.id === undefined || seg.id === '') return label;
      return `${label}${ID_SEP}${escapePart(seg.id)}`;
    })
    .join(SEG_SEP);
}

/** Mirror of `parseTrail` from `@atelier/components/breadcrumb`. */
function parseTrail(query: string, key: string): readonly TrailSegment[] {
  if (query.length === 0) return [];
  let raw = query;
  if (query.includes('=') || query.startsWith('?')) {
    // Hand-extract instead of using `URLSearchParams.get(key)` so the raw
    // value (with `%5F` / `%7C` intact) survives — `URLSearchParams`
    // auto-percent-decodes and would defeat our delimiter-escape pass.
    const extracted = extractRawValue(query, key);
    if (extracted === null) return [];
    raw = extracted;
  }
  if (raw.length === 0) return [];
  const out: TrailSegment[] = [];
  for (const piece of raw.split(SEG_SEP)) {
    if (piece.length === 0) continue;
    const sepIdx = piece.indexOf(ID_SEP);
    let labelRaw: string;
    let idRaw: string | undefined;
    if (sepIdx === -1) {
      labelRaw = piece;
      idRaw = undefined;
    } else {
      labelRaw = piece.slice(0, sepIdx);
      idRaw = piece.slice(sepIdx + 1);
    }
    try {
      const label = decodeURIComponent(labelRaw);
      if (label.length === 0) continue;
      if (idRaw === undefined || idRaw.length === 0) {
        out.push({ label });
      } else {
        out.push({ label, id: decodeURIComponent(idRaw) });
      }
    } catch {
      // Malformed — drop silently so a share-link with a stray `%` doesn't
      // crash the route.
    }
  }
  return out;
}

function extractRawValue(query: string, key: string): string | null {
  const q = query.startsWith('?') ? query.slice(1) : query;
  if (q.length === 0) return null;
  const target = `${key}=`;
  for (const pair of q.split('&')) {
    if (pair.startsWith(target)) return pair.slice(target.length);
    if (pair === key) return '';
  }
  return null;
}

export interface UseTrailOptions {
  /**
   * When `true`, the hook reads the trail from `window.location.search` on
   * mount and writes it back via `window.history.replaceState` on every
   * change. When `false` (default), the trail is in-memory only and the
   * host is responsible for URL persistence.
   */
  syncToUrl?: boolean;
  /** URL query-string key. Defaults to `'_trail'`. */
  urlKey?: string;
  /**
   * Initial trail. Used during SSR / first render and when `syncToUrl` is
   * enabled BUT the URL has no trail yet.
   */
  initialTrail?: readonly TrailSegment[];
}

export interface UseTrailResult {
  /** Read-only view of the current trail. */
  trail: readonly TrailSegment[];
  /** Append `segment` to the trail. */
  push: (segment: TrailSegment) => void;
  /** Remove the deepest segment. No-op on empty trail. */
  pop: () => void;
  /** Empty the trail. */
  clear: () => void;
  /** Replace the trail wholesale. */
  setTrail: (trail: readonly TrailSegment[]) => void;
}

/**
 * Returns trail state + mutators. Pass `{ syncToUrl: true }` to opt the
 * trail into `?_trail=…` round-tripping.
 */
export function useTrail(opts: UseTrailOptions = {}): UseTrailResult {
  const { syncToUrl = false, urlKey = '_trail', initialTrail } = opts;

  // Capture the URL key in a ref so changing it across renders is benign
  // (it only matters on mount + at write-time, never as a dep that would
  // re-run the parse effect).
  const urlKeyRef = useRef<string>(urlKey);
  urlKeyRef.current = urlKey;

  // Initial state: `initialTrail` (or empty). We deliberately do NOT read
  // `window.location.search` during the lazy initializer because doing so
  // makes hydration mismatch-prone — the SSR pass produced the initial
  // trail, and the client must agree on render #1 before reconciling on
  // the next paint.
  const [trail, setTrailState] = useState<readonly TrailSegment[]>(() => initialTrail ?? []);

  // Read from URL on mount (post-hydration) when `syncToUrl` is opted in.
  useEffect(() => {
    if (!syncToUrl) return;
    if (typeof window === 'undefined') return;
    const parsed = parseTrail(window.location.search, urlKeyRef.current);
    if (parsed.length === 0) {
      // URL has no trail — keep `initialTrail` (already in state) and write
      // it through to the URL so a subsequent share preserves it.
      if ((initialTrail?.length ?? 0) > 0) {
        writeTrailToUrl(initialTrail ?? [], urlKeyRef.current);
      }
      return;
    }
    setTrailState(parsed);
    // The dependency array is `[syncToUrl]` only — `urlKey` lives in a ref,
    // and `initialTrail` is intentionally read once at mount.
  }, [syncToUrl]);

  const writeUrl = useCallback(
    (next: readonly TrailSegment[]): void => {
      if (!syncToUrl) return;
      writeTrailToUrl(next, urlKeyRef.current);
    },
    [syncToUrl],
  );

  const setTrail = useCallback(
    (next: readonly TrailSegment[]): void => {
      setTrailState(next);
      writeUrl(next);
    },
    [writeUrl],
  );

  const push = useCallback(
    (segment: TrailSegment): void => {
      setTrailState((prev) => {
        const next = [...prev, segment];
        writeUrl(next);
        return next;
      });
    },
    [writeUrl],
  );

  const pop = useCallback((): void => {
    setTrailState((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      writeUrl(next);
      return next;
    });
  }, [writeUrl]);

  const clear = useCallback((): void => {
    setTrailState((prev) => (prev.length === 0 ? prev : []));
    writeUrl([]);
  }, [writeUrl]);

  return useMemo<UseTrailResult>(
    () => ({ trail, push, pop, clear, setTrail }),
    [trail, push, pop, clear, setTrail],
  );
}

/**
 * Internal — write `trail` into `window.location.search` under `key` via
 * `replaceState`. SSR-safe (no-op when `window` is undefined). Empty trail
 * removes the key from the URL entirely so a stale `?_trail=` doesn't
 * linger in the address bar.
 */
function writeTrailToUrl(trail: readonly TrailSegment[], key: string): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  // We hand-build the search string instead of using `URLSearchParams.set`
  // because that API double-encodes our pre-escaped payload (turning
  // `%5F` into `%255F`). The serializer already produced a query-safe
  // value — we just need to splice it into the existing search string.
  const url = new URL(window.location.href);
  const newSearch = setRawQueryParam(
    url.search,
    key,
    trail.length === 0 ? null : serializeTrail(trail),
  );
  url.search = newSearch;
  // `replaceState` so drilldown does NOT pollute the back-button history.
  // Hosts that want push semantics use their router + `setTrail` together.
  try {
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Some sandboxed environments (Safari private mode in older versions,
    // about:blank) throw on `replaceState`. The trail still lives in React
    // state — URL persistence is best-effort.
  }
}

/**
 * Splice `key=value` into a query string by raw text manipulation, leaving
 * existing percent-escaped sequences intact. `value === null` removes the
 * key. Other params are preserved in their original encoding.
 */
function setRawQueryParam(search: string, key: string, value: string | null): string {
  const q = search.startsWith('?') ? search.slice(1) : search;
  const target = `${key}=`;
  const pairs: string[] = [];
  let replaced = false;
  if (q.length > 0) {
    for (const pair of q.split('&')) {
      if (pair === key || pair.startsWith(target)) {
        if (value !== null && !replaced) {
          pairs.push(`${target}${value}`);
          replaced = true;
        }
        // else: drop (delete-key path) OR drop subsequent duplicates.
      } else {
        pairs.push(pair);
      }
    }
  }
  if (!replaced && value !== null) pairs.push(`${target}${value}`);
  if (pairs.length === 0) return '';
  return `?${pairs.join('&')}`;
}
