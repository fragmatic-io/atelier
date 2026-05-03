// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Cnt-3 — Mention / @user / #issue / link auto-resolution.
 *
 * Pluggable resolver protocol. Atelier ships zero per-prefix logic — hosts
 * implement `MentionResolver` for the prefixes they care about (`@` for
 * users, `#` for issues, `!` for incidents, …) and wire them via
 * `<MentionAware text=… resolver=…>`.
 *
 * Reference: Notion @-mentions, Linear `#ENG-123` autolinks, Slack
 * `<@user>`. The protocol is deliberately small: a resolver maps a parsed
 * `MentionMatch` to a `MentionDisplay` (label + optional href + optional
 * preview ReactNode + optional icon). The display surface — the inline
 * chip + hover-card preview — is `<Mention>` / `<MentionAware>`. The
 * resolver doesn't render anything itself; it only describes WHAT to
 * render.
 *
 * Why the resolver returns `null` on unknown ids
 * ----------------------------------------------
 * Hosts often surface mentions extracted by a regex over user-typed text.
 * A typo (`@alise`) or a since-deleted entity (`#ENG-99999` after the
 * issue was archived) should fall back to the raw text. Returning `null`
 * is the unambiguous "I don't know about this id" signal — distinct from
 * a `MentionDisplay` whose label is empty (which is a host bug).
 *
 * Why resolvers may be sync OR async
 * ----------------------------------
 * Demo / static-roster hosts have no fetch — they look the id up in an
 * in-memory map and return `MentionDisplay` synchronously. Production
 * hosts hit a directory service and return `Promise<MentionDisplay>`.
 * The protocol accepts both shapes; `<Mention>` awaits if needed and
 * snapshots the result so re-renders don't re-fetch.
 *
 * Composition with `<HoverCard>` (Int-13)
 * ---------------------------------------
 * `MentionDisplay.preview` is a `ReactNode` — when present, the inline
 * chip wraps in a `<HoverCard>` whose body is that node. Hosts pass a
 * full mini-card (avatar + name + role; or issue title + status +
 * assignee) and Cnt-3 surfaces it. When `preview` is absent the chip
 * renders without a hover card, which is the right behaviour for
 * lightweight autolinks (`#ENG-123` → `https://linear.app/…`).
 *
 * Cnt-5 will compose this protocol from the markdown renderer side.
 */
import type { ReactNode } from 'react';
import type { IconRef } from '../icons/icon-ref.js';

/**
 * One parsed mention from the source text. Produced by `parseMentions`,
 * consumed by `<Mention>`. The shape is intentionally flat so resolvers
 * can pattern-match on `prefix` and `id` without unpacking nested objects.
 */
export interface MentionMatch {
  /**
   * Pattern key like `'@'`, `'#'`, `'!'`. The prefix character itself,
   * not a name like `'user'`. A resolver picks which prefixes it handles
   * via its `prefixes` field.
   */
  prefix: string;
  /**
   * The matched id WITHOUT the leading prefix. For `'@alice'` this is
   * `'alice'`; for `'#ENG-123'` it is `'ENG-123'`. The id is the resolver
   * lookup key.
   */
  id: string;
  /**
   * The original matched text including the prefix (`'@alice'`,
   * `'#ENG-123'`). Surfaced as the fallback when the resolver returns
   * null and as the chip's accessible label.
   */
  raw: string;
  /**
   * Character offset in the source text where the match starts. Stable
   * for `parseMentions` round-trips; useful for hosts that want to thread
   * editor selections through the parsed segments.
   */
  offset: number;
}

/**
 * Visual / link metadata a resolver returns. The display surface
 * (`<Mention>`) consumes this verbatim — the resolver doesn't render
 * anything itself.
 */
export interface MentionDisplay {
  /**
   * Human-readable label rendered inside the chip. Resolvers may strip
   * the prefix (`'Alice'` rather than `'@alice'`) or surface a richer
   * label (`'ENG-123: Fix the login flow'`). The chip wraps this in the
   * resolver-supplied `className` so hosts can style by mention type.
   */
  label: string;
  /**
   * Optional href. When present, the chip renders as an `<a>` so the
   * mention is keyboard-navigable and right-clickable. When absent the
   * chip is a plain `<span>` (no implicit link to nowhere).
   */
  href?: string;
  /**
   * Optional rich-content node surfaced via `<HoverCard>` on hover /
   * focus. Hosts pass a full mini-card (avatar + name + role for users;
   * title + status + assignee for issues). When absent the chip renders
   * without a hover card.
   */
  preview?: ReactNode;
  /**
   * Optional leading icon. Bare-string form (`'user'`) resolves against
   * the default icon set; `{ set, name }` overrides for hosts wiring
   * multi-pack resolvers.
   */
  icon?: IconRef;
  /**
   * Class string forwarded to the chip. Hosts use this to colour user
   * mentions blue, issue mentions amber, etc., without `<Mention>` taking
   * a runtime dep on a styling library.
   */
  className?: string;
}

/**
 * A resolver maps `MentionMatch`es of one or more prefixes to display
 * data. Hosts implement this; Atelier ships zero concrete resolvers.
 */
export interface MentionResolver {
  /**
   * Prefixes this resolver handles. `<MentionAware>` uses the union of
   * all registered resolvers' prefixes when calling `parseMentions`. If
   * a resolver claims `'@'` and `'#'`, it is responsible for branching
   * on `match.prefix` inside `resolve`.
   */
  prefixes: readonly string[];
  /**
   * Resolve a match to display data. Returns `null` (sync or via the
   * Promise) when the id is unknown — `<Mention>` falls back to the raw
   * text in that case.
   *
   * Sync return is permitted (and preferred) for in-memory rosters; async
   * return is for hosts that hit a directory service.
   */
  resolve(match: MentionMatch): Promise<MentionDisplay | null> | MentionDisplay | null;
}

/**
 * Compose multiple per-prefix resolvers into a single resolver that
 * dispatches by `match.prefix`. Hosts that wire `@user`, `#issue`, and
 * `!incident` separately can register them as three small resolvers and
 * combine them with `combineMentionResolvers([userR, issueR, incidentR])`
 * — the result has the union of their prefixes and routes each match to
 * the resolver that claimed it.
 *
 * Two resolvers claiming the same prefix is a host bug; the FIRST one in
 * `resolvers` wins. We don't throw because the resolver list is often
 * built up dynamically (per-feature flags, per-tenant) and a hard error
 * would gate render on a non-fatal misconfiguration.
 */
export function combineMentionResolvers(resolvers: readonly MentionResolver[]): MentionResolver {
  const byPrefix = new Map<string, MentionResolver>();
  for (const r of resolvers) {
    for (const p of r.prefixes) {
      if (!byPrefix.has(p)) byPrefix.set(p, r);
    }
  }
  const prefixes = Array.from(byPrefix.keys());
  return {
    prefixes,
    resolve(match: MentionMatch): Promise<MentionDisplay | null> | MentionDisplay | null {
      const r = byPrefix.get(match.prefix);
      if (!r) return null;
      return r.resolve(match);
    },
  };
}
