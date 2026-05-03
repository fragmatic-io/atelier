// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / Cnt-3 — `<Mention>` inline rendering primitive.
 *
 * Renders one parsed `MentionMatch` as a chip whose visual / link shape
 * comes from a `MentionResolver`. Compositional surface:
 *
 *   `<Mention match=… resolver=… fallback=… />`
 *
 *  - Sync resolvers render in a single pass; no flash, no useEffect.
 *  - Async resolvers render the raw text (or the supplied `fallback`)
 *    while the promise is in flight, then swap to the resolved chip when
 *    the promise settles. A second resolution for the SAME `match` is
 *    suppressed; component identity tracks the in-flight request.
 *  - When the resolver returns `null` the chip falls back to the raw
 *    text (or the supplied `fallback`). This is the contract for
 *    "unknown id" — see `resolver.ts` doc.
 *  - When `display.preview` is supplied, the chip wraps in a
 *    `<HoverCard>` whose body is that node. Hover-card hover / focus
 *    timings are inherited from `HoverCard`'s defaults (350ms open,
 *    150ms close); see HoverCard's Wave 7b doc-block.
 *
 * Why not just call the resolver inside `<MentionAware>` and pass the
 * resolved display down? Two reasons:
 *  1. Async resolvers need a per-match useState. Doing this at the
 *     `<MentionAware>` level would either force the host to provide all
 *     resolutions up front (defeating the lazy / fetch-shaped resolver
 *     contract) or push a parallel-promises orchestration up there.
 *     Per-`<Mention>` keeps the orchestration trivially local.
 *  2. Tests + future Cnt-5 markdown integration want to render a single
 *     mention chip in isolation (e.g. inside a fully-rendered Markdown
 *     paragraph). The standalone primitive is part of the public surface.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { HoverCard } from './HoverCard.js';
import { Icon } from './Icon.js';
import { normalizeIconRef } from '../icons/icon-ref.js';
import type { MentionDisplay, MentionMatch, MentionResolver } from '../mentions/resolver.js';

export interface MentionProps {
  /** The parsed match to render. */
  match: MentionMatch;
  /** The resolver to consult. Sync OR async return is permitted. */
  resolver: MentionResolver;
  /**
   * Rendered while an async resolution is in flight, and when the
   * resolver returns `null`. Defaults to `match.raw` (e.g. `"@alice"`).
   */
  fallback?: ReactNode;
}

/**
 * `MentionDisplay | null` after resolution; `undefined` while a
 * promise is in flight (sync resolvers skip this state entirely).
 */
type ResolutionState = MentionDisplay | null | undefined;

/**
 * Resolve `resolver(match)` synchronously when possible, returning a
 * tuple `[immediate, promise]`. `immediate` is the `MentionDisplay | null`
 * from a sync return; `promise` is the awaited result for an async
 * return. Exactly one of the two is non-null. We split this out so the
 * useState initialiser path can pull the sync value with no extra render.
 */
function callResolver(
  resolver: MentionResolver,
  match: MentionMatch,
): {
  immediate: MentionDisplay | null | undefined;
  promise: Promise<MentionDisplay | null> | null;
} {
  const ret = resolver.resolve(match);
  if (ret === null) return { immediate: null, promise: null };
  if (typeof (ret as Promise<unknown>).then === 'function') {
    const p = ret as Promise<MentionDisplay | null>;
    // Attach a no-op `.catch` here so a rejection from the lazy
    // useState-initialiser path doesn't surface as an unhandled
    // rejection. The effect path still observes the rejection and falls
    // back to raw.
    p.catch(() => undefined);
    return { immediate: undefined, promise: p };
  }
  return { immediate: ret as MentionDisplay, promise: null };
}

export function Mention({ match, resolver, fallback }: MentionProps): ReactNode {
  /**
   * Initialise from the sync resolver path (or `undefined` for async).
   * The lazy initialiser keeps the resolver call out of subsequent renders
   * — invoked only on first mount per (match identity) pair.
   */
  const [state, setState] = useState<ResolutionState>(
    () => callResolver(resolver, match).immediate,
  );

  /**
   * Track the latest in-flight match so a stale promise doesn't write
   * back over a newer resolution. We compare by reference: the parent
   * passes a new `match` object each time `parseMentions` re-runs, which
   * is the right granularity (the parser is pure, so re-runs only happen
   * when the source text changes).
   */
  const latestMatchRef = useRef(match);

  useEffect(() => {
    latestMatchRef.current = match;
    const { immediate, promise } = callResolver(resolver, match);
    if (promise === null) {
      // Sync resolver — write the result (could be null for unknown id).
      setState(immediate);
      return;
    }
    setState(undefined);
    let cancelled = false;
    promise.then(
      (resolved) => {
        if (cancelled) return;
        if (latestMatchRef.current !== match) return;
        setState(resolved);
      },
      () => {
        // Treat resolver rejection like an unknown id — fall back to raw.
        if (cancelled) return;
        if (latestMatchRef.current !== match) return;
        setState(null);
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [match, resolver]);

  const fallbackNode = fallback ?? match.raw;

  // Pending (async in flight) OR null (unknown id) → fallback.
  if (state === undefined || state === null) {
    return (
      <span
        data-cir-component="Mention"
        data-cir-state={state === undefined ? 'pending' : 'unresolved'}
        data-prefix={match.prefix}
      >
        {fallbackNode}
      </span>
    );
  }

  const display = state;
  const Tag: 'a' | 'span' = display.href !== undefined && display.href.length > 0 ? 'a' : 'span';
  const linkProps = Tag === 'a' ? { href: display.href as string } : ({} as Record<string, never>);

  const inner = (
    <Tag
      data-cir-component="Mention"
      data-cir-state="resolved"
      data-prefix={match.prefix}
      aria-label={match.raw}
      className={display.className}
      {...linkProps}
    >
      {display.icon !== undefined
        ? (() => {
            const ref = normalizeIconRef(display.icon);
            return (
              <span data-cir-part="mention-icon" style={{ display: 'inline-flex' }}>
                <Icon set={ref.set} name={ref.name} size={12} strokeWidth={1.5} />
              </span>
            );
          })()
        : null}
      <span data-cir-part="mention-label">{display.label}</span>
    </Tag>
  );

  if (display.preview === undefined) return inner;

  // The chip itself is the hover trigger; HoverCard requires a single
  // ReactElement child. `inner` is already a single element.
  return (
    <HoverCard content={display.preview} ariaLabel={`${match.raw} preview`}>
      {inner}
    </HoverCard>
  );
}
Mention.displayName = 'Mention';

export const MentionBinding: ComponentBinding = {
  id: 'Mention',
  factory: Mention as ComponentBinding['factory'],
};
