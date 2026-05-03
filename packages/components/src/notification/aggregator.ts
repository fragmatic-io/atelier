// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * Wave 11 / Vis-10 — notification badge system.
 *
 * `NotificationAggregator` is the host-owned data model behind grouped per-
 * domain unread badges (the Slack workspace → channel → mention pattern,
 * Discord's server-then-channel grouping, Linear's per-team inbox count).
 *
 * Shape:
 *   - One entry per `scope` — a caller-namespaced identifier such as
 *     `'workspace-acme'` or `'channel-engineering'`. The aggregator does
 *     not interpret the string; consumers pick a hierarchy that suits the
 *     surface (typical: dot-or-dash separated segments so prefix rollups
 *     match the visible tree).
 *   - `total` is the unread count (messages + mentions combined). Mention
 *     count is an OPTIONAL `mentions` subset so the renderer can paint a
 *     different colour when `mentions > 0` (Slack's red bubble vs.
 *     greyish-blue unread bubble).
 *
 * The aggregator is intentionally minimal: the host fans out wire updates
 * (websocket / polling / push event) into `set()` calls, and React surfaces
 * subscribe via `subscribe()` to re-render. No persistence, no transport,
 * no fan-in logic — those layer above this seam.
 *
 * Pairs with `<Sidebar>` (Wave 11 / Nav-2) via the `aggregator` prop +
 * per-item `badgeScope`. The sidebar reads the rollup sum for the bound
 * scope prefix and renders a `<MetaBadge>` (variant `live` when mentions
 * are present, `default` otherwise).
 */

/**
 * One slice of unread state. Always carries a `scope` identifier so the
 * aggregator's `set()` is callable with the value alone.
 */
export interface NotificationCount {
  /** Total unread items (messages + mentions combined). */
  total: number;
  /** Subset of `total` that is a mention / important / @-tagged item. */
  mentions?: number;
  /** Identifier — caller's namespace (e.g. `'channel-engineering'`, `'workspace-acme'`). */
  scope: string;
}

/**
 * Listener callback fired whenever the aggregator's contents change.
 * Listeners receive no arguments — the convention mirrors React's
 * `useSyncExternalStore` shape, so consumers re-read state via `list()`
 * / `get()` / `rollup()` rather than diffing a payload.
 */
export type NotificationAggregatorListener = () => void;

/**
 * Internal helper — clamp a count to a non-negative integer. The
 * aggregator never silently rewrites a caller's value beyond this; it's
 * purely a defensive guard so a stray `-1` doesn't poison a rollup.
 */
function sanitize(count: number): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

/**
 * `NotificationAggregator` — the data model behind Vis-10 grouped
 * badges. See module docstring for the surface contract.
 */
export class NotificationAggregator {
  private readonly entries = new Map<string, NotificationCount>();
  private readonly listeners = new Set<NotificationAggregatorListener>();
  /**
   * Monotonic revision counter — bumped on every mutation. Stable
   * between writes so React's `useSyncExternalStore` snapshot check
   * does not trigger an infinite loop (the alternative — returning a
   * fresh `Map`/array — fails the referential-equality fast path).
   */
  private rev = 0;

  /**
   * Read the current revision counter. Suitable as a
   * `useSyncExternalStore` snapshot — increments once per mutation,
   * so subscribers re-render when (and only when) state has changed.
   */
  public version(): number {
    return this.rev;
  }

  /**
   * Set the count for a scope. Replaces any prior entry. Emits to all
   * subscribers AFTER the write lands so listeners observe the new
   * snapshot (not the prior one).
   *
   * Counts are sanitised: `total` and `mentions` are clamped to
   * non-negative integers; `mentions` is dropped when zero so the
   * stored shape stays minimal.
   */
  public set(scope: string, count: NotificationCount): void {
    const total = sanitize(count.total);
    const mentions =
      count.mentions !== undefined && sanitize(count.mentions) > 0
        ? sanitize(count.mentions)
        : undefined;
    const next: NotificationCount =
      mentions !== undefined ? { scope, total, mentions } : { scope, total };
    this.entries.set(scope, next);
    this.rev += 1;
    this.emit();
  }

  /**
   * Read the entry for an exact scope. Returns `undefined` when the
   * caller hasn't `set()` it yet — consumers can treat this as "no
   * unread state known", which is distinct from `{ total: 0 }`.
   */
  public get(scope: string): NotificationCount | undefined {
    return this.entries.get(scope);
  }

  /**
   * Sum every entry whose scope STARTS WITH `prefix`. The exact-match
   * entry (`scope === prefix`) is included. Returned shape uses
   * `prefix` as its `scope` so the value is renderable as-is.
   *
   * Empty prefix returns the global rollup (every entry summed). This
   * is intentional — a top-of-app "all unread" badge is the natural
   * use case.
   */
  public rollup(prefix: string): NotificationCount {
    let total = 0;
    let mentions = 0;
    for (const entry of this.entries.values()) {
      if (prefix.length > 0 && !entry.scope.startsWith(prefix)) continue;
      total += entry.total;
      mentions += entry.mentions ?? 0;
    }
    return mentions > 0 ? { scope: prefix, total, mentions } : { scope: prefix, total };
  }

  /**
   * Snapshot every entry as a frozen array. Iteration order matches
   * insertion order (`Map` semantics) so callers that depend on stable
   * ordering get it without extra sorting.
   */
  public list(): readonly NotificationCount[] {
    return Object.freeze(Array.from(this.entries.values()));
  }

  /**
   * Register a change listener. Returns the unsubscribe handle —
   * idempotent per `useSyncExternalStore` conventions.
   */
  public subscribe(listener: NotificationAggregatorListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Drop every entry. Mostly useful in tests + on logout / workspace
   * switch when the entire badge surface should reset. Emits once
   * (subscribers can decide to no-op when the snapshot is empty).
   */
  public clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.rev += 1;
    this.emit();
  }

  /**
   * Fan listeners out. Errors in one listener do NOT prevent the
   * others from firing — we trap and continue, mirroring DOM event
   * dispatch semantics. The trap is silent because aggregator-side
   * logging would tie this primitive to a host logger.
   */
  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // intentional: see method docstring
      }
    }
  }
}
