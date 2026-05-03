// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / Cnt-4 — `<Embed>` inline rendering primitive.
 *
 * Resolves a URL through an `EmbedRegistry` and renders the result as one
 * of four shapes:
 *   - `'video'`  → `<iframe>` with 16:9 aspect-ratio styling (override
 *                  via `display.width` / `display.height`).
 *   - `'iframe'` → `<iframe>` with no baked-in aspect ratio.
 *   - `'card'`   → link card (anchor wrapping thumbnail + title + desc).
 *   - `'oembed'` → raw HTML pass-through (sanitization is a host
 *                  responsibility — see resolver doc).
 *
 * Behaviour:
 *  - Resolution starts on mount. While the registry promise is in flight,
 *    we render `'Loading…'` (or the supplied `loading` ReactNode) inside
 *    a placeholder with `data-cir-state="pending"`.
 *  - On success, swap to the resolved surface with
 *    `data-cir-state="resolved"` and `data-provider=<provider>`.
 *  - On `null` (no resolver matched, resolver rejected, or resolver
 *    returned null) we fall back to a plain `<a href>` link to the
 *    original URL with `data-cir-state="unresolved"`.
 *  - URL changes restart resolution; in-flight resolutions are cancelled
 *    by ref so a stale promise can't write back over a newer answer.
 *
 * Why not synchronous initial render
 * ----------------------------------
 * `EmbedRegistry.resolve` is always Promise-shaped (the registry
 * normalises sync resolvers behind the same surface so dispatch can be
 * uniform). For URLs handled by sync resolvers (YouTube / Loom / Figma),
 * the promise resolves on the next microtask — there's a tiny "Loading…"
 * flash. If that ever matters in practice we'll add a fast-path that
 * inspects sync return inside the registry; today no host needs it.
 *
 * Why `<Embed>` is NOT a manifest-bound component
 * -----------------------------------------------
 * Per the spec, embeds are a host-level composition primitive — the
 * compiler doesn't bind them, so we deliberately omit a `ComponentBinding`
 * and don't register in `COMPONENT_BINDINGS`. Markdown (Cnt-5) and smart
 * paste (Int-15) consume `<Embed>` directly from React.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EmbedDisplay } from '../embeds/resolver.js';
import type { EmbedRegistry } from '../embeds/registry.js';

export interface EmbedProps {
  /** The URL to resolve + render. */
  url: string;
  /** Registry to consult. Hosts wire one and pass it down. */
  registry: EmbedRegistry;
  /**
   * Rendered while the registry promise is in flight. Defaults to a
   * neutral `'Loading…'` text node inside the placeholder span.
   */
  loading?: ReactNode;
  /**
   * Rendered when the registry returns null — an unresolvable URL.
   * Defaults to a plain `<a href>` link to `url` with the URL as text.
   * Hosts can pass a richer fallback (e.g. a small "couldn't unfurl"
   * card) when they want.
   */
  fallback?: ReactNode;
  /** Forwarded to the wrapping element so hosts can theme by surface. */
  className?: string;
}

type ResolutionState =
  | { status: 'pending' }
  | { status: 'resolved'; provider: string; display: EmbedDisplay }
  | { status: 'unresolved' };

const PENDING: ResolutionState = { status: 'pending' };
const UNRESOLVED: ResolutionState = { status: 'unresolved' };

const VIDEO_DEFAULT_WIDTH = 560;
const VIDEO_DEFAULT_HEIGHT = 315;

export function Embed({ url, registry, loading, fallback, className }: EmbedProps): ReactNode {
  const [state, setState] = useState<ResolutionState>(PENDING);

  /**
   * Track the latest `(url, registry)` pair so a stale promise from a
   * previous render can't write back over the current resolution.
   */
  const latestKeyRef = useRef<{ url: string; registry: EmbedRegistry } | null>(null);

  useEffect(() => {
    const key = { url, registry };
    latestKeyRef.current = key;
    setState(PENDING);
    let cancelled = false;
    registry.resolve(url).then(
      (resolved) => {
        if (cancelled) return;
        if (latestKeyRef.current !== key) return;
        if (resolved === null) {
          setState(UNRESOLVED);
          return;
        }
        setState({ status: 'resolved', provider: resolved.provider, display: resolved.display });
      },
      () => {
        // Defensive — `EmbedRegistry.resolve` already swallows resolver
        // rejections, but a custom registry implementation might leak
        // them. Treat as unresolved.
        if (cancelled) return;
        if (latestKeyRef.current !== key) return;
        setState(UNRESOLVED);
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [url, registry]);

  if (state.status === 'pending') {
    return (
      <span
        data-cir-component="Embed"
        data-cir-state="pending"
        className={className}
        aria-busy="true"
      >
        {loading ?? 'Loading…'}
      </span>
    );
  }

  if (state.status === 'unresolved') {
    return (
      <span data-cir-component="Embed" data-cir-state="unresolved" className={className}>
        {fallback ?? (
          <a href={url} rel="noopener noreferrer" data-cir-part="embed-fallback-link">
            {url}
          </a>
        )}
      </span>
    );
  }

  const { provider, display } = state;
  const commonAttrs = {
    'data-cir-component': 'Embed',
    'data-cir-state': 'resolved',
    'data-provider': provider,
    'data-kind': display.kind,
    className,
  } as const;

  if (display.kind === 'video') {
    const width = display.width ?? VIDEO_DEFAULT_WIDTH;
    const height = display.height ?? VIDEO_DEFAULT_HEIGHT;
    return (
      <div {...commonAttrs}>
        <iframe
          src={display.iframeSrc}
          title={display.title ?? 'Embedded video'}
          width={width}
          height={height}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          data-cir-part="embed-iframe"
        />
      </div>
    );
  }

  if (display.kind === 'iframe') {
    return (
      <div {...commonAttrs}>
        <iframe
          src={display.iframeSrc}
          title={display.title ?? 'Embedded content'}
          {...(display.width !== undefined ? { width: display.width } : {})}
          {...(display.height !== undefined ? { height: display.height } : {})}
          data-cir-part="embed-iframe"
        />
      </div>
    );
  }

  if (display.kind === 'oembed') {
    // Pass through host-supplied HTML. The resolver doc explicitly puts
    // sanitization on the host; we wrap in a div so DOM diffs are clean.
    return (
      <div
        {...commonAttrs}
        data-cir-part="embed-oembed"
        // dangerouslySetInnerHTML is the only way to render an oEmbed
        // `html` payload. The resolver contract puts sanitization on the
        // host (see resolver.ts doc-block).
        dangerouslySetInnerHTML={{ __html: display.html ?? '' }}
      />
    );
  }

  // 'card' — link card with thumbnail / title / description.
  return (
    <a {...commonAttrs} href={url} rel="noopener noreferrer" aria-label={display.title ?? url}>
      {display.thumbnail !== undefined ? (
        <img
          src={display.thumbnail}
          alt=""
          data-cir-part="embed-thumbnail"
          {...(display.width !== undefined ? { width: display.width } : {})}
          {...(display.height !== undefined ? { height: display.height } : {})}
        />
      ) : null}
      <div data-cir-part="embed-card-body">
        {display.title !== undefined ? (
          <div data-cir-part="embed-title">{display.title}</div>
        ) : null}
        {display.description !== undefined ? (
          <div data-cir-part="embed-description">{display.description}</div>
        ) : null}
      </div>
    </a>
  );
}
Embed.displayName = 'Embed';
