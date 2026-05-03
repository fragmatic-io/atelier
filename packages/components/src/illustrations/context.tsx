// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * IllustrationResolverContext — React context that carries an
 * `IllustrationResolver` down the tree. `<EmptyState illustration="…">`
 * reads from this context to look up its SVG markup.
 *
 * The default context value is `NoopIllustrationResolver` (returns `null`
 * for everything) so components fall through to "no illustration" cleanly
 * when no provider is in scope. Hosts opt in by wrapping their tree in
 * `<IllustrationResolverProvider resolver={…}>`.
 *
 * Wave 11 (Vis-5).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { NoopIllustrationResolver, type IllustrationResolver } from './resolver.js';

export const IllustrationResolverContext =
  createContext<IllustrationResolver>(NoopIllustrationResolver);

export interface IllustrationResolverProviderProps {
  /** The resolver to expose to descendants. */
  resolver: IllustrationResolver;
  /** Subtree that may contain `<EmptyState illustration="…">` instances. */
  children: ReactNode;
}

/**
 * Wrap a subtree to plug an illustration pack into `<EmptyState>`. Multiple
 * providers can nest; the innermost wins.
 */
export function IllustrationResolverProvider({
  resolver,
  children,
}: IllustrationResolverProviderProps): ReactNode {
  return (
    <IllustrationResolverContext.Provider value={resolver}>
      {children}
    </IllustrationResolverContext.Provider>
  );
}
IllustrationResolverProvider.displayName = 'IllustrationResolverProvider';

/** Hook used by `<EmptyState>` (and any host code) to grab the active resolver. */
export function useIllustrationResolver(): IllustrationResolver {
  return useContext(IllustrationResolverContext);
}
