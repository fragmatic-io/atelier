// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * IconResolverContext — React context that carries an `IconResolver` down
 * the tree. `<Icon>` reads from this context to look up its SVG markup.
 *
 * The default context value is `NoopIconResolver` (returns `null` for
 * everything). Hosts opt in by wrapping their tree in
 * `<IconResolverProvider resolver={…}>`.
 *
 * Wave 7b (Vis-3).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { NoopIconResolver, type IconResolver } from './resolver.js';

export const IconResolverContext = createContext<IconResolver>(NoopIconResolver);

export interface IconResolverProviderProps {
  /** The resolver to expose to descendants. */
  resolver: IconResolver;
  /** Subtree that may contain `<Icon>` instances. */
  children: ReactNode;
}

/**
 * Wrap a subtree to plug a real icon pack into `<Icon>`. Multiple providers
 * can nest; the innermost wins.
 */
export function IconResolverProvider({ resolver, children }: IconResolverProviderProps): ReactNode {
  return <IconResolverContext.Provider value={resolver}>{children}</IconResolverContext.Provider>;
}
IconResolverProvider.displayName = 'IconResolverProvider';

/** Internal hook used by `<Icon>` to grab the active resolver. */
export function useIconResolver(): IconResolver {
  return useContext(IconResolverContext);
}
