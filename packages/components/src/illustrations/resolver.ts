// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Illustration resolver protocol — Wave 11 (Vis-5).
 *
 * Mirrors the Vis-3 `IconResolver` shape but for the larger, situation-specific
 * artwork that Linear / Notion-grade empty states use. Where icons are
 * decorative glyphs identified by `(set, name)`, illustrations are
 * single-namespace mascots / shapes identified by a flat `name` (e.g.
 * `'inbox-zero'`, `'no-results'`). They also carry an optional ARIA `label`
 * so a meaningful illustration can announce itself to assistive tech (the
 * title still does the bulk of the messaging — the label is a nicety, not
 * a duplicate).
 *
 * `@atelier/components` ships a small bundled set (see `./builtins`) so the
 * default `<EmptyState illustration="inbox-zero">` looks coherent out of the
 * box. Hosts that want a richer brand pack provide their own resolver via
 * `<IllustrationResolverProvider resolver={…}>` and the innermost provider
 * wins, exactly like the icon resolver.
 *
 * Resolvers return host-trusted SVG strings; `<EmptyState>` injects them via
 * `dangerouslySetInnerHTML`. Same trust contract as `IconResolver`: never
 * wire an `IllustrationResolver` whose source is untrusted (e.g. user-typed
 * SVG markup) without sanitising upstream.
 */

/**
 * The shape returned for a known illustration. `svg` is the raw markup
 * (including the `<svg …>` root); `label` is an optional ARIA description.
 */
export interface IllustrationEntry {
  svg: string;
  label?: string;
}

export interface IllustrationResolver {
  /**
   * Returns the SVG markup + optional ARIA label for a given illustration
   * name, or `null` if the host doesn't know it. Implementations should be
   * pure and synchronous; if a host needs async loading they should hydrate
   * the resolver before mounting.
   */
  resolve(name: string): IllustrationEntry | null;
}

/**
 * Resolver backed by a flat `Record<name, entry>`. Most hosts will produce
 * one of these once at startup from their bundled illustration pack.
 */
export class MapIllustrationResolver implements IllustrationResolver {
  constructor(private readonly map: Readonly<Record<string, IllustrationEntry>>) {}

  resolve(name: string): IllustrationEntry | null {
    return this.map[name] ?? null;
  }
}

/**
 * Default no-op resolver. Returns `null` for every lookup; `<EmptyState>`
 * gracefully omits the illustration slot when this is in scope.
 */
export const NoopIllustrationResolver: IllustrationResolver = Object.freeze({
  resolve(_name: string): IllustrationEntry | null {
    return null;
  },
});
