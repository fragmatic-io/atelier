// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / Cnt-3 — `<MentionAware>` multi-mention wrapper.
 *
 * Convenience composition primitive that takes raw `text`, runs it
 * through `parseMentions` against a resolver's claimed `prefixes`, and
 * renders each parsed segment — literal strings as text nodes, matches
 * as `<Mention>` chips wrapped in a `<HoverCard>` (when the resolver
 * surfaces a `preview`).
 *
 * `<MentionAware>` is a host-level composition primitive — it is NOT
 * exposed in the manifest catalog. The protocol surface authors compose
 * directly is `<Mention>` + `parseMentions`; `<MentionAware>` exists
 * because the parse-then-render dance is identical at every call site
 * and shouldn't be re-implemented per host.
 *
 * Cnt-5 (markdown at Linear quality) will compose this from the
 * markdown text-renderer side: every `<p>`'s text content is run through
 * `<MentionAware>` so `@user` / `#issue` chips render inline inside
 * paragraphs without the markdown library having to know about the
 * resolver protocol.
 */
import { Fragment, type ReactNode } from 'react';
import { Mention } from './Mention.js';
import { parseMentions } from '../mentions/parser.js';
import type { MentionResolver } from '../mentions/resolver.js';

export interface MentionAwareProps {
  /** Source text to scan for mentions. */
  text: string;
  /**
   * Resolver consulted for every match. The resolver's `prefixes` field
   * is what the parser uses — hosts that want a different prefix set
   * should compose their resolvers via `combineMentionResolvers` so
   * `prefixes` is the union.
   */
  resolver: MentionResolver;
  /**
   * Forwarded to every `<Mention>`. Defaults to per-match `match.raw`.
   * Hosts rarely override this; it's exposed for tests + hosts that
   * want a uniform "loading…" chip while async resolutions are in flight.
   */
  mentionFallback?: ReactNode;
}

export function MentionAware({ text, resolver, mentionFallback }: MentionAwareProps): ReactNode {
  const segments = parseMentions(text, resolver.prefixes);
  return (
    <Fragment>
      {segments.map((seg, idx) => {
        if (typeof seg === 'string') {
          // Literal text chunks render directly; no host element so prose
          // wrapping / styling from the parent applies unchanged.
          return <Fragment key={`t-${String(idx)}`}>{seg}</Fragment>;
        }
        return (
          <Mention
            // Stable per-match key: offset alone is unique within one
            // `text` (the parser emits matches in source order).
            key={`m-${String(seg.offset)}`}
            match={seg}
            resolver={resolver}
            fallback={mentionFallback}
          />
        );
      })}
    </Fragment>
  );
}
MentionAware.displayName = 'MentionAware';
