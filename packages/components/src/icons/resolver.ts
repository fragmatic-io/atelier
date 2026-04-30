// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Icon resolver protocol — Wave 7b (Vis-3).
 *
 * `@cir/components` ships ZERO icon packs. Hosts plug their own pack in by
 * implementing `IconResolver` and providing it via `IconResolverProvider`.
 * The resolver returns the SVG markup string for a given (set, name) pair,
 * or `null` when the icon isn't known to the host.
 *
 * Three reference implementations ship here:
 *   - `MapIconResolver`     — backed by a `ReadonlyMap<string, string>`
 *                             keyed `${set}:${name}`.
 *   - `LiteralIconResolver` — backed by a nested literal record
 *                             `{ [set]: { [name]: svg } }`. Convenient for
 *                             tests and one-off fixtures.
 *   - `NoopIconResolver`    — returns `null` for everything; the default
 *                             when no provider is in scope. Components fall
 *                             back to a placeholder span so layout is stable
 *                             even when the host hasn't wired a pack.
 *
 * Resolvers return host-trusted SVG strings. The `<Icon>` component injects
 * them via `dangerouslySetInnerHTML`. This is acceptable BECAUSE the
 * resolver is the host's contract — they choose what SVGs are exposed.
 * Never wire an `IconResolver` whose source is untrusted (e.g. user-typed
 * SVG markup) without sanitizing first.
 */
export interface IconResolver {
  /**
   * Returns the SVG markup string (or `null` if missing) for a given
   * (set, name). Implementations should be pure and synchronous; if a host
   * needs async loading they should hydrate the resolver before mounting.
   */
  resolve(set: string, name: string): string | null;
}

/**
 * Resolver backed by a flat `ReadonlyMap` keyed `${set}:${name}`. Most
 * runtime hosts will produce one of these once at startup from their
 * bundled icon pack.
 */
export class MapIconResolver implements IconResolver {
  constructor(private readonly map: ReadonlyMap<string, string>) {}

  resolve(set: string, name: string): string | null {
    return this.map.get(`${set}:${name}`) ?? null;
  }
}

/**
 * Resolver backed by a nested literal `{ [set]: { [name]: svg } }`. Useful
 * for tests, examples, and small static fixtures.
 */
export class LiteralIconResolver implements IconResolver {
  constructor(
    private readonly literal: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ) {}

  resolve(set: string, name: string): string | null {
    const bucket = this.literal[set];
    if (bucket === undefined) return null;
    return bucket[name] ?? null;
  }
}

/**
 * Default no-op resolver. Returns `null` for every lookup; the `<Icon>`
 * component renders a layout-stable placeholder when this is in scope.
 * Hosts opt in to a real pack by mounting `<IconResolverProvider>`.
 */
export const NoopIconResolver: IconResolver = Object.freeze({
  resolve(_set: string, _name: string): string | null {
    return null;
  },
});
