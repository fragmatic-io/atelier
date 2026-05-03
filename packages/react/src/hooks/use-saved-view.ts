// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useSavedView()` — Wave 11 / Cnt-10.
 *
 * Stateful saved-view selector. Pairs with `IntentProfile.saved_views`
 * (canonical store) and `serializeView` / `parseView` from
 * `@atelier/components/views/url` (URL share format). The hook owns the
 * "which view is active right now" decision plus an in-memory mutable
 * list of views — hosts wire the `save` mutation through to their own
 * vault writer when they want a save to persist.
 *
 * Why a separate hook (instead of folding into `useTrail`)?
 * --------------------------------------------------------
 * The trail (Nav-4) is an ORDERED stack of drilldown segments — you push
 * and pop. A view is a NAMED snapshot — you activate by id. They share
 * the URL-sync mechanic but have different mutators and different
 * persistence stories (trail is ephemeral; views are vault-backed).
 *
 * Why duplicate `ViewDefinition` here as a structural mirror?
 * -----------------------------------------------------------
 * `@atelier/react` deliberately does NOT take a runtime dependency on
 * `@atelier/schemas` — keeping the adapter free of `zod` is a long-
 * standing footprint guarantee (mirrors the `useTrail` precedent of
 * mirroring `TrailSegment` rather than importing it). TypeScript treats
 * the two definitions as structurally compatible: a `ViewDefinition`
 * from `@atelier/schemas` flows into the hook's `views` prop without a
 * cast, and the activated value flows back out to a `<ViewSwitcher>`
 * that imports its types from `@atelier/components`.
 *
 * SSR contract
 * ------------
 * On the server (no `window`) the hook returns the FIRST view in `views`
 * as the active one (or `undefined` if the list is empty); the URL sync
 * no-ops. The first effect on the client reads `?_view=…` and (when
 * present) activates the matching saved view OR — when the URL carries a
 * full inline payload (parseable but not in the saved list) — surfaces
 * it as the active view without persisting. This is the Linear / Stripe
 * "shareable URL" semantic: the recipient sees the SAME view shape even
 * if they haven't saved it themselves.
 *
 * URL update strategy
 * -------------------
 * `window.history.replaceState` (NOT `pushState`) — switching views
 * should update the URL in place rather than spam the back-button
 * stack. Hosts that want push semantics call `activate` and update the
 * URL via their router.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Structural mirror of `ViewDefinition` from `@atelier/schemas`. Defined
 * here too so the React adapter stays free of a runtime dep on the
 * schemas package. Cross-package usage is type-compatible by shape.
 */
export interface ViewDefinition {
  id: string;
  label: string;
  display: 'list' | 'kanban' | 'calendar' | 'grid' | 'gallery';
  source: string;
  filters?: readonly ViewFilter[];
  sort?: ViewSort;
  group_by?: string;
  density?: 'compact' | 'comfortable' | 'spacious';
}

export interface ViewFilter {
  field: string;
  op: 'eq' | 'ne' | 'in' | 'gt' | 'lt' | 'contains';
  value: unknown;
}

export interface ViewSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface UseSavedViewOptions {
  /**
   * The user's saved views — typically sourced from
   * `IntentProfile.saved_views` and threaded down through context. The
   * hook treats this as the source of truth on first render; later
   * `save()` calls extend a local copy (the host wires the persistent
   * write itself).
   */
  views: readonly ViewDefinition[];
  /**
   * When `true`, the hook reads the active view from `?_view=…` on
   * mount and writes it back via `window.history.replaceState` on every
   * activation. When `false` (default), the active id stays in-memory.
   */
  syncToUrl?: boolean;
  /** URL query-string key. Defaults to `'_view'`. */
  urlKey?: string;
  /**
   * Initial active view id. Used during SSR / first render. When `views`
   * does not contain `initialActiveId`, the hook falls back to the
   * first view in the list (or `undefined` if the list is empty).
   */
  initialActiveId?: string;
}

export interface UseSavedViewResult {
  /** The currently active view, or `undefined` when none is active. */
  active: ViewDefinition | undefined;
  /** The full saved-views list (host-supplied + locally-saved). */
  views: readonly ViewDefinition[];
  /**
   * Activate the view with the given id. Silently no-ops when no saved
   * view matches (mirrors the trail's `pop`-on-empty semantics — hosts
   * never need to bracket the call in a try/catch).
   */
  activate: (id: string) => void;
  /**
   * Save (or replace, by id) a view. The hook updates its local mirror
   * and writes through to the URL when `syncToUrl` is on. Hosts wire
   * the persistent write (vault / IntentProfile mutation) themselves
   * so the persistence boundary stays explicit.
   */
  save: (view: ViewDefinition) => void;
}

const SEG_KEY_DEFAULT = '_view';

// -----------------------------------------------------------------------------
// Wire format — base64url-encoded JSON. Mirrors the implementation in
// `@atelier/components/views/url`. Inlined here for the same reason
// `useTrail` mirrors `serializeTrail`: the React adapter does not take a
// runtime dep on `@atelier/components`.
// -----------------------------------------------------------------------------

function base64UrlEncode(input: string): string {
  let b64: string;
  if (typeof btoa === 'function') {
    b64 = btoa(unescape(encodeURIComponent(input)));
  } else {
    b64 = Buffer.from(input, 'utf8').toString('base64');
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  else if (pad === 1) throw new Error('invalid base64url length');
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(b64)));
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

function compactView(view: ViewDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: view.id,
    label: view.label,
    display: view.display,
    source: view.source,
  };
  if (view.filters !== undefined && view.filters.length > 0) out['filters'] = view.filters;
  if (view.sort !== undefined) out['sort'] = view.sort;
  if (view.group_by !== undefined && view.group_by.length > 0) out['group_by'] = view.group_by;
  if (view.density !== undefined) out['density'] = view.density;
  return out;
}

function serializeView(view: ViewDefinition): string {
  return base64UrlEncode(JSON.stringify(compactView(view)));
}

const VALID_DISPLAYS: ReadonlyArray<ViewDefinition['display']> = [
  'list',
  'kanban',
  'calendar',
  'grid',
  'gallery',
];
const VALID_DENSITIES: ReadonlyArray<NonNullable<ViewDefinition['density']>> = [
  'compact',
  'comfortable',
  'spacious',
];
const VALID_OPS: ReadonlyArray<ViewFilter['op']> = ['eq', 'ne', 'in', 'gt', 'lt', 'contains'];

/**
 * Lightweight structural validator. Mirrors `ViewDefinitionSchema.safeParse`
 * from `@atelier/schemas` without pulling `zod` into the adapter bundle.
 * Returns `null` for any shape mismatch so a malformed share-link degrades
 * to "no active view" rather than crashing the hook.
 */
function validateView(raw: unknown): ViewDefinition | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || r['id'].length === 0) return null;
  if (typeof r['label'] !== 'string' || r['label'].length === 0) return null;
  if (typeof r['display'] !== 'string') return null;
  if (!VALID_DISPLAYS.includes(r['display'] as ViewDefinition['display'])) return null;
  if (typeof r['source'] !== 'string' || r['source'].length === 0) return null;
  const out: ViewDefinition = {
    id: r['id'],
    label: r['label'],
    display: r['display'] as ViewDefinition['display'],
    source: r['source'],
  };
  if (r['filters'] !== undefined) {
    if (!Array.isArray(r['filters'])) return null;
    const filters: ViewFilter[] = [];
    for (const f of r['filters']) {
      if (f === null || typeof f !== 'object') return null;
      const fr = f as Record<string, unknown>;
      if (typeof fr['field'] !== 'string' || fr['field'].length === 0) return null;
      if (typeof fr['op'] !== 'string') return null;
      if (!VALID_OPS.includes(fr['op'] as ViewFilter['op'])) return null;
      filters.push({ field: fr['field'], op: fr['op'] as ViewFilter['op'], value: fr['value'] });
    }
    out['filters'] = filters;
  }
  if (r['sort'] !== undefined) {
    if (r['sort'] === null || typeof r['sort'] !== 'object') return null;
    const s = r['sort'] as Record<string, unknown>;
    if (typeof s['field'] !== 'string' || s['field'].length === 0) return null;
    if (s['direction'] !== 'asc' && s['direction'] !== 'desc') return null;
    out['sort'] = { field: s['field'], direction: s['direction'] };
  }
  if (r['group_by'] !== undefined) {
    if (typeof r['group_by'] !== 'string' || r['group_by'].length === 0) return null;
    out['group_by'] = r['group_by'];
  }
  if (r['density'] !== undefined) {
    if (typeof r['density'] !== 'string') return null;
    if (!VALID_DENSITIES.includes(r['density'] as NonNullable<ViewDefinition['density']>))
      return null;
    out['density'] = r['density'] as NonNullable<ViewDefinition['density']>;
  }
  return out;
}

function parseView(query: string, key: string): ViewDefinition | null {
  if (query.length === 0) return null;
  let raw = query;
  if (query.includes('=') || query.startsWith('?')) {
    const extracted = extractRawValue(query, key);
    if (extracted === null) return null;
    raw = extracted;
  }
  if (raw.length === 0) return null;
  let json: string;
  try {
    json = base64UrlDecode(raw);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  return validateView(parsed);
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

/**
 * Splice `key=value` into a query string by raw-text manipulation, leaving
 * existing percent-escapes intact. `value === null` removes the key.
 * Mirrors the helper in `useTrail` so the two slots behave identically.
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
      } else {
        pairs.push(pair);
      }
    }
  }
  if (!replaced && value !== null) pairs.push(`${target}${value}`);
  if (pairs.length === 0) return '';
  return `?${pairs.join('&')}`;
}

function writeViewToUrl(view: ViewDefinition | undefined, key: string): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  const url = new URL(window.location.href);
  url.search = setRawQueryParam(url.search, key, view === undefined ? null : serializeView(view));
  try {
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Sandboxed environments may reject `replaceState` — the hook stays
    // best-effort: React state still reflects the user's choice.
  }
}

/**
 * Returns active-view state + mutators. Pass `{ syncToUrl: true }` to opt
 * the active selection into `?_view=…` round-tripping.
 */
export function useSavedView(opts: UseSavedViewOptions): UseSavedViewResult {
  const { views: hostViews, syncToUrl = false, urlKey = SEG_KEY_DEFAULT, initialActiveId } = opts;

  const urlKeyRef = useRef<string>(urlKey);
  urlKeyRef.current = urlKey;

  // Local mirror of saved views. Seeded from the host; `save()` extends
  // the mirror without writing back to the host (the host owns the
  // persistent write through its own vault adapter).
  const [views, setViews] = useState<readonly ViewDefinition[]>(() => hostViews);

  // Re-seed local mirror when the host list identity changes (host
  // reactively pushed a new IntentProfile.saved_views array). We compare
  // by reference — a shallow-equal change is the host's signal that
  // something changed; deep-equal updates would defeat the purpose of
  // the local mirror (the host is the authoritative writer).
  const lastHostViewsRef = useRef<readonly ViewDefinition[]>(hostViews);
  useEffect(() => {
    if (lastHostViewsRef.current === hostViews) return;
    lastHostViewsRef.current = hostViews;
    setViews(hostViews);
  }, [hostViews]);

  // Active id. Lazy initializer picks the first match against
  // `initialActiveId`, otherwise the first view in the list (Linear's
  // "Active issues" semantic — there's always SOMETHING selected when
  // saved views exist). The URL read happens in a post-mount effect
  // because `parseView` may produce an inline shape the saved list
  // doesn't contain (shareable URL → adopt as ephemeral active view).
  const [activeId, setActiveIdState] = useState<string | undefined>(() => {
    if (initialActiveId !== undefined && hostViews.some((v) => v.id === initialActiveId)) {
      return initialActiveId;
    }
    return hostViews[0]?.id;
  });

  // Ephemeral inline view (URL-supplied, not in the saved list). When
  // present, takes precedence over `activeId` so the recipient of a
  // share link sees the same view even if they haven't saved it.
  const [inlineView, setInlineView] = useState<ViewDefinition | undefined>(undefined);

  useEffect(() => {
    if (!syncToUrl) return;
    if (typeof window === 'undefined') return;
    const parsed = parseView(window.location.search, urlKeyRef.current);
    if (parsed === null) return;
    // If the parsed view matches a saved id, activate that. Otherwise
    // surface it as the inline view — the host can offer a "Save this
    // view" affordance to promote it.
    const match = views.find((v) => v.id === parsed.id);
    if (match !== undefined) {
      setActiveIdState(parsed.id);
      setInlineView(undefined);
    } else {
      setInlineView(parsed);
    }
    // The URL parse runs once on mount + when syncToUrl flips on; the
    // saved-views list lives in `views` ref-style (we deliberately do
    // NOT re-run when `views` changes — the active id is preserved).
  }, [syncToUrl, views]);

  const writeUrl = useCallback(
    (next: ViewDefinition | undefined): void => {
      if (!syncToUrl) return;
      writeViewToUrl(next, urlKeyRef.current);
    },
    [syncToUrl],
  );

  const activate = useCallback(
    (id: string): void => {
      const next = views.find((v) => v.id === id);
      if (next === undefined) return;
      setActiveIdState(id);
      setInlineView(undefined);
      writeUrl(next);
    },
    [views, writeUrl],
  );

  const save = useCallback(
    (view: ViewDefinition): void => {
      setViews((prev) => {
        const idx = prev.findIndex((v) => v.id === view.id);
        if (idx === -1) return [...prev, view];
        const copy = prev.slice();
        copy[idx] = view;
        return copy;
      });
      setActiveIdState(view.id);
      setInlineView(undefined);
      writeUrl(view);
    },
    [writeUrl],
  );

  const active = useMemo<ViewDefinition | undefined>(() => {
    if (inlineView !== undefined) return inlineView;
    if (activeId === undefined) return undefined;
    return views.find((v) => v.id === activeId);
  }, [activeId, inlineView, views]);

  return useMemo<UseSavedViewResult>(
    () => ({ active, views, activate, save }),
    [active, views, activate, save],
  );
}
