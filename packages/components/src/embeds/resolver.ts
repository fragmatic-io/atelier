// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Cnt-4 — Embed system. Pluggable per-provider resolver protocol
 * for unfurling URLs into rich previews (link cards, video iframes, oEmbed
 * payloads).
 *
 * The shape mirrors Cnt-3's mention resolver: a small protocol (`matches`
 * + `resolve`), a registry surface (`EmbedRegistry`, see `./registry.ts`),
 * and an inline rendering primitive (`<Embed>`, see
 * `../components/Embed.tsx`) that owns the async-resolution dance. Atelier
 * ships a handful of built-in resolvers (YouTube, Loom, Figma, an oEmbed
 * fallback in `./builtin.ts`) but no hard provider deps — `oembedResolver`
 * is constructed with a host-supplied `fetch` function so this package
 * stays runtime-agnostic.
 *
 * Why resolvers may be sync OR async (same as Cnt-3)
 * --------------------------------------------------
 * YouTube / Loom / Figma resolvers extract an id from the URL with a
 * regex and synthesize an iframe URL synchronously — no fetch needed.
 * oEmbed-style resolvers must hit the provider endpoint and return a
 * `Promise<EmbedDisplay>`. The protocol accepts both shapes; `<Embed>`
 * awaits when the resolver returns a thenable and otherwise renders in a
 * single pass.
 *
 * Why `null` is the "I don't know" signal
 * ---------------------------------------
 * A URL that matches no resolver in the registry should fall back to a
 * plain `<a>` link — distinct from "the resolver tried and the upstream
 * gave us no metadata", which still falls back the same way but is logged
 * differently. Returning `null` from `resolve` (sync or via the Promise)
 * is the unambiguous unresolvable signal; rejection is treated the same
 * way at the surface.
 *
 * Cnt-5 (markdown at Linear quality) and Int-15 (smart paste with link
 * unfurl) compose this protocol from above.
 */

/**
 * One URL the registry has dispatched to a resolver. The provider key is
 * the same string the host registered under (`'youtube'`, `'figma'`, …)
 * — the resolver re-receives it for branching when it claims more than
 * one provider.
 */
export interface EmbedMatch {
  /** The original URL the host asked the registry to resolve. */
  url: string;
  /** Detected provider key (e.g. `'youtube'`, `'figma'`, `'loom'`). */
  provider: string;
}

/**
 * The render shape `<Embed>` consumes. Each `kind` selects a different
 * surface:
 *
 *  - `'video'` — render an iframe with the video aspect ratio (16:9 by
 *    default; `width` / `height` override).
 *  - `'card'` — render a link card with thumbnail + title + description
 *    (Twitter / GitHub / generic Open Graph shape).
 *  - `'iframe'` — render a generic iframe (Figma proto, sandboxed
 *    interactive embeds). No baked-in aspect ratio; host supplies size.
 *  - `'oembed'` — render whatever HTML the oEmbed payload supplies. The
 *    `<Embed>` surface still wraps it in a `data-cir-component="Embed"`
 *    container; HTML is NOT sanitized at this layer (hosts that accept
 *    arbitrary URLs are responsible for their own sanitisation policy).
 */
export interface EmbedDisplay {
  kind: 'video' | 'card' | 'iframe' | 'oembed';
  /** Human-readable title, surfaced as the card heading or iframe `title`. */
  title?: string;
  /** Thumbnail URL (card kind) — rendered as the leading image. */
  thumbnail?: string;
  /** Subtitle / OG description (card kind). */
  description?: string;
  /**
   * iframe `src` for `'video'` and `'iframe'` kinds. Required when the
   * kind is one of those two; ignored for `'card'`.
   */
  iframeSrc?: string;
  /** Optional explicit width (px). When omitted, surface defaults apply. */
  width?: number;
  /** Optional explicit height (px). When omitted, surface defaults apply. */
  height?: number;
  /**
   * Raw HTML for `'oembed'` kind only. Not sanitized here — hosts decide.
   */
  html?: string;
}

/**
 * Resolver protocol. Hosts (and Atelier's built-ins) implement this for
 * the providers they care about and register them with an `EmbedRegistry`.
 */
export interface EmbedResolver {
  /**
   * Cheap synchronous URL-shape test. Called by the registry to find the
   * first resolver that claims a URL. Implementations should keep this
   * O(string-length) — typically a regex `.test()` or a `startsWith` check.
   */
  matches(url: string): boolean;
  /**
   * Resolve a matched URL to display data. Sync OR async return is
   * permitted; `null` (sync or via the Promise) signals "I matched the
   * URL shape but have no useful data" — `<Embed>` falls back to a plain
   * link in that case.
   */
  resolve(match: EmbedMatch): Promise<EmbedDisplay | null> | EmbedDisplay | null;
}
