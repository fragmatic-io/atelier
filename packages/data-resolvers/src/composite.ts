// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `CompositeDataResolver` — falls through a list of resolvers; the first
 * resolver that returns a non-`undefined` value wins. Useful for
 * "Mock for capability X, REST for everything else" wiring without
 * requiring a routing layer at the call site.
 *
 * The composite is itself a `DataResolver`, so it can be wrapped in
 * `withCache(...)` exactly like any other adapter.
 *
 * Behaviour notes:
 *   - Each resolver is awaited in order; the loop stops on the first
 *     value that isn't `undefined`. `null` counts as a value.
 *   - If a resolver throws, the composite re-throws — failures are not
 *     swallowed silently. Hosts that want fallback-on-error should wrap
 *     the failing resolver with a `try/catch` adapter themselves; we
 *     prefer explicit error handling over a magic catch-all.
 */

import type { DataBinding, DataResolver } from './types.js';

export interface CompositeResolverOptions {
  /**
   * Optional `predicate` per child resolver. When provided, the composite
   * skips a child whose predicate returns false for the binding.
   *
   * Example: skip the REST resolver for capabilities that aren't in its
   * URL map, so the composite goes straight to the mock fallback.
   */
  predicates?: ((binding: DataBinding) => boolean)[];
}

export class CompositeDataResolver {
  readonly #resolvers: DataResolver[];
  readonly #predicates: ((binding: DataBinding) => boolean)[];

  constructor(resolvers: DataResolver[], options: CompositeResolverOptions = {}) {
    if (resolvers.length === 0) {
      throw new Error('CompositeDataResolver requires at least one child resolver');
    }
    this.#resolvers = resolvers;
    this.#predicates = options.predicates ?? [];
  }

  resolve = async (binding: DataBinding): Promise<unknown> => {
    for (let i = 0; i < this.#resolvers.length; i += 1) {
      const predicate = this.#predicates[i];
      if (predicate && !predicate(binding)) continue;
      const resolver = this.#resolvers[i]!;
      const result = await resolver(binding);
      if (result !== undefined) return result;
    }
    return undefined;
  };
}
