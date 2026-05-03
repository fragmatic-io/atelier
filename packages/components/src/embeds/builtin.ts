// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Cnt-4 — Built-in embed resolvers.
 *
 * Atelier ships these as the obvious-default coverage for the embeds
 * teams reach for first (YouTube + Loom for video; Figma for design
 * proto / file embeds; oEmbed as the universal fallback). Hosts can
 * register them all, register a subset, or replace any of them with a
 * custom implementation under the same provider key.
 *
 * Hard-dep avoidance
 * ------------------
 * None of these reach the network in module scope. The first three
 * (YouTube, Loom, Figma) extract an id with a regex and synthesize an
 * iframe URL — fully synchronous, no fetch. `oembedResolver` is a
 * factory: it accepts a host-supplied `fetch` function and an endpoint
 * template, so this package never depends on `globalThis.fetch` (Node 18
 * + browsers have it, Node 16 does not, RSC contexts have a different
 * shape).
 *
 * Why not detect Twitter / Tweet here
 * -----------------------------------
 * Twitter requires the (paid) v2 API or oEmbed, both of which are
 * environment-coupled. Hosts that need tweets register an `oembedResolver`
 * pointing at their proxy (or a custom resolver hitting their preferred
 * unfurl service). The TODO entry calls out tweet/figma/loom — figma +
 * loom are URL-shape-extractable and ship; tweet is intentionally
 * delegated to oEmbed.
 */
import type { EmbedDisplay, EmbedMatch, EmbedResolver } from './resolver.js';

// -----------------------------------------------------------------------------
// YouTube
// -----------------------------------------------------------------------------

/**
 * Match URL shapes:
 *   - https://www.youtube.com/watch?v=VIDEOID
 *   - https://youtube.com/watch?v=VIDEOID&t=42
 *   - https://m.youtube.com/watch?v=VIDEOID
 *   - https://youtu.be/VIDEOID
 *   - https://youtu.be/VIDEOID?t=42
 *   - https://www.youtube.com/embed/VIDEOID
 *   - https://www.youtube.com/shorts/VIDEOID
 *   - https://www.youtube.com/live/VIDEOID
 *
 * Returns the 11-char id, or null if the URL doesn't carry one.
 */
export function extractYouTubeId(url: string): string | null {
  // Short links: youtu.be/<id>
  const shortMatch = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/.exec(url);
  if (shortMatch) return shortMatch[1] ?? null;

  // Path-shaped: /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const pathMatch =
    /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/.exec(
      url,
    );
  if (pathMatch) return pathMatch[1] ?? null;

  // Watch URL: ?v=<id>
  const watchMatch =
    /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})(?:[&#]|$)/.exec(
      url,
    );
  if (watchMatch) return watchMatch[1] ?? null;

  return null;
}

/**
 * Synchronous YouTube resolver — extracts the video id and synthesizes
 * an iframe URL. No thumbnail / title is supplied at this layer; surfaces
 * that want richer metadata wire an oEmbed resolver under a higher
 * priority.
 */
export const youtubeResolver: EmbedResolver = {
  matches(url: string): boolean {
    return extractYouTubeId(url) !== null;
  },
  resolve(match: EmbedMatch): EmbedDisplay | null {
    const id = extractYouTubeId(match.url);
    if (id === null) return null;
    return {
      kind: 'video',
      iframeSrc: `https://www.youtube.com/embed/${id}`,
      title: 'YouTube video',
    };
  },
};

// -----------------------------------------------------------------------------
// Loom
// -----------------------------------------------------------------------------

/**
 * Match Loom share URLs:
 *   - https://www.loom.com/share/<id>
 *   - https://loom.com/share/<id>
 *   - https://www.loom.com/embed/<id>
 *
 * The id is a 32-char hex string in production; we accept any
 * `[A-Za-z0-9]{16,}` to be tolerant of future format changes.
 */
export function extractLoomId(url: string): string | null {
  const m = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([A-Za-z0-9]{16,})(?:[/?#]|$)/.exec(
    url,
  );
  return m?.[1] ?? null;
}

export const loomResolver: EmbedResolver = {
  matches(url: string): boolean {
    return extractLoomId(url) !== null;
  },
  resolve(match: EmbedMatch): EmbedDisplay | null {
    const id = extractLoomId(match.url);
    if (id === null) return null;
    return {
      kind: 'video',
      iframeSrc: `https://www.loom.com/embed/${id}`,
      title: 'Loom recording',
    };
  },
};

// -----------------------------------------------------------------------------
// Figma
// -----------------------------------------------------------------------------

/**
 * Match Figma file / proto / design URLs:
 *   - https://www.figma.com/file/<key>/<slug>
 *   - https://www.figma.com/proto/<key>/<slug>
 *   - https://www.figma.com/design/<key>/<slug>
 *
 * Returns the file key (24-char alphanumeric in production; we accept
 * `[A-Za-z0-9]{8,}`).
 */
export function extractFigmaKey(url: string): { key: string; kind: string } | null {
  const m =
    /^https?:\/\/(?:www\.)?figma\.com\/(file|proto|design)\/([A-Za-z0-9]{8,})(?:[/?#]|$)/.exec(url);
  if (!m) return null;
  const kind = m[1];
  const key = m[2];
  if (!kind || !key) return null;
  return { key, kind };
}

export const figmaResolver: EmbedResolver = {
  matches(url: string): boolean {
    return extractFigmaKey(url) !== null;
  },
  resolve(match: EmbedMatch): EmbedDisplay | null {
    if (extractFigmaKey(match.url) === null) return null;
    // Figma's official embed endpoint accepts the original URL as a
    // query param. We pass through the URL verbatim — no need to
    // re-shape into key + kind.
    return {
      kind: 'iframe',
      iframeSrc: `https://www.figma.com/embed?embed_host=atelier&url=${encodeURIComponent(
        match.url,
      )}`,
      title: 'Figma',
    };
  },
};

// -----------------------------------------------------------------------------
// Generic oEmbed fallback
// -----------------------------------------------------------------------------

/**
 * The minimal subset of an oEmbed v1 response we map onto `EmbedDisplay`.
 * The real oEmbed spec has more fields; everything else is ignored.
 *
 * @see https://oembed.com/
 */
export interface OEmbedResponse {
  /**
   * One of `'photo' | 'video' | 'link' | 'rich'` per the oEmbed v1 spec.
   * Typed as `string` so future provider extensions don't require a
   * library change; the mapper uses the four spec types and falls
   * through everything else to the link-card surface.
   */
  type?: string;
  title?: string;
  thumbnail_url?: string;
  description?: string;
  html?: string;
  url?: string;
  width?: number;
  height?: number;
}

/**
 * Fetch shape we accept. Mirrors the standard `fetch` signature for the
 * subset we use; hosts pass `globalThis.fetch.bind(globalThis)` in
 * browsers / Node 18+, or wire a custom proxy fetcher.
 */
export type OEmbedFetch = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface OEmbedResolverOptions {
  /**
   * Endpoint that proxies oEmbed requests. The resolver appends
   * `?url=<encoded-target>` (or merges into existing query). Most hosts
   * deploy a small server-side proxy at `/api/oembed?url=…` to avoid CORS
   * + provider allowlist headaches; that's the path this default
   * encodes.
   */
  endpoint: string;
  /** Host-supplied fetch implementation. Required (no `globalThis` fallback). */
  fetch: OEmbedFetch;
  /**
   * Optional URL filter — return false for URLs the proxy doesn't handle
   * to skip the network round-trip. Defaults to "match anything that
   * looks like an http(s) URL".
   */
  matches?: (url: string) => boolean;
}

/**
 * Build an oEmbed-shaped resolver. Registered last in a registry, this
 * acts as the catch-all for URLs the URL-shape resolvers (YouTube, Loom,
 * Figma) didn't claim.
 *
 * The mapping from oEmbed `type` to `EmbedDisplay.kind`:
 *   - `'video'` → `kind: 'video'`     (uses `html` if present, otherwise `url`)
 *   - `'rich'`  → `kind: 'oembed'`    (raw HTML pass-through)
 *   - `'photo'` → `kind: 'card'`      (thumbnail-only card)
 *   - `'link'` / unknown → `kind: 'card'` (title + description + thumbnail)
 *
 * On any non-2xx response, parse failure, or thrown fetch we return
 * `null`. The `<Embed>` surface falls back to a plain link.
 */
export function oembedResolver(options: OEmbedResolverOptions): EmbedResolver {
  const matchFn = options.matches ?? defaultOEmbedMatch;
  return {
    matches(url: string): boolean {
      return matchFn(url);
    },
    async resolve(match: EmbedMatch): Promise<EmbedDisplay | null> {
      const target = appendUrlParam(options.endpoint, match.url);
      let response: Awaited<ReturnType<OEmbedFetch>>;
      try {
        response = await options.fetch(target);
      } catch {
        return null;
      }
      if (!response.ok) return null;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return null;
      }
      if (typeof payload !== 'object' || payload === null) return null;
      return mapOEmbedToDisplay(payload);
    },
  };
}

function defaultOEmbedMatch(url: string): boolean {
  return /^https?:\/\//.test(url);
}

function appendUrlParam(endpoint: string, target: string): string {
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}url=${encodeURIComponent(target)}`;
}

/**
 * Map a parsed oEmbed payload to `EmbedDisplay`. Exported for tests +
 * for hosts that want to bypass the resolver and feed a payload directly.
 */
export function mapOEmbedToDisplay(payload: OEmbedResponse): EmbedDisplay {
  const type = payload.type ?? 'link';
  const base: EmbedDisplay = {
    kind: 'card',
    ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
    ...(typeof payload.thumbnail_url === 'string' ? { thumbnail: payload.thumbnail_url } : {}),
    ...(typeof payload.description === 'string' ? { description: payload.description } : {}),
    ...(typeof payload.width === 'number' ? { width: payload.width } : {}),
    ...(typeof payload.height === 'number' ? { height: payload.height } : {}),
  };
  if (type === 'video') {
    return {
      ...base,
      kind: 'video',
      ...(typeof payload.url === 'string' ? { iframeSrc: payload.url } : {}),
      ...(typeof payload.html === 'string' ? { html: payload.html } : {}),
    };
  }
  if (type === 'rich') {
    return {
      ...base,
      kind: 'oembed',
      ...(typeof payload.html === 'string' ? { html: payload.html } : {}),
    };
  }
  // photo / link / unknown — render as a card.
  return base;
}
