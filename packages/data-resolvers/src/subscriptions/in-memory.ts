// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `InMemorySubscriptionResolver` — a `DataResolver` whose `subscribe(binding)`
 * delegates to a per-binding factory function returning an `AsyncIterable`.
 *
 * Designed for tests, demos, and the local-only path of multiplayer
 * fixtures (Coll-1..5). The factory is given the binding verbatim so it
 * can shape the stream per `binding.source`. Returning `undefined` from
 * the factory means "no subscription for this binding" — the protocol
 * contract for hosts that don't stream that source.
 *
 * The resolver also satisfies the legacy `resolve(binding)` path: by
 * default it returns `undefined` (no snapshot), but a caller can pass
 * `snapshot(binding)` to materialise a one-shot value alongside the
 * stream. This keeps the resolver a drop-in `DataResolver` for the React
 * render walker, which always calls `resolve()` first to seed initial
 * data.
 *
 * Wave 10 / S-3 — see also {@link SseSubscriptionResolver} for the HTTP
 * transport. Together they gate Coll-1..5 (presence / cursors / comments)
 * by giving the resolver protocol a real-time channel.
 */

import type { DataBinding, DataResolver } from '../types.js';

export interface InMemorySubscriptionResolverOptions<T = unknown> {
  /**
   * Factory that returns an `AsyncIterable<T>` for the given binding, or
   * `undefined` if the binding has no live source. Each call yields a
   * fresh iterable (so multiple subscribers don't share iterator state).
   */
  factory: (binding: DataBinding) => AsyncIterable<T> | undefined;
  /**
   * Optional one-shot snapshot returned from `resolve(binding)`. Defaults
   * to `undefined` (no snapshot — components show their empty state until
   * the first stream event arrives).
   */
  snapshot?: (binding: DataBinding) => unknown;
}

/**
 * Build an in-memory subscription resolver. Returns the function-form
 * `DataResolver` with `.subscribe` attached so it satisfies the protocol
 * directly — bind as `dataResolver={resolver}` when wiring `<CirRuntime>`.
 *
 * @example
 *   const resolver = createInMemorySubscriptionResolver({
 *     factory: (binding) => {
 *       if (binding.source !== 'presence.users') return undefined;
 *       return (async function* () {
 *         yield { user_id: 'a', cursor: { x: 0, y: 0 } };
 *         yield { user_id: 'a', cursor: { x: 10, y: 5 } };
 *       })();
 *     },
 *   });
 */
export function createInMemorySubscriptionResolver<T = unknown>(
  options: InMemorySubscriptionResolverOptions<T>,
): DataResolver {
  const { factory, snapshot } = options;
  const resolver: DataResolver = (binding: DataBinding): unknown => {
    return snapshot ? snapshot(binding) : undefined;
  };
  resolver.subscribe = (binding: DataBinding): AsyncIterable<unknown> | undefined => {
    return factory(binding);
  };
  return resolver;
}

/**
 * Class form of {@link createInMemorySubscriptionResolver}, mirroring the
 * other resolvers in this package (`MockDataResolver`, `RestDataResolver`,
 * etc.) for stylistic consistency. The instance's `resolve` and
 * `subscribe` properties are bound arrow functions so they can be passed
 * around without losing `this`.
 */
export class InMemorySubscriptionResolver<T = unknown> {
  readonly #factory: (binding: DataBinding) => AsyncIterable<T> | undefined;
  readonly #snapshot: ((binding: DataBinding) => unknown) | undefined;

  constructor(options: InMemorySubscriptionResolverOptions<T>) {
    this.#factory = options.factory;
    this.#snapshot = options.snapshot;
  }

  /** `DataResolver` protocol entry — returns the optional snapshot. */
  resolve = (binding: DataBinding): unknown => {
    return this.#snapshot ? this.#snapshot(binding) : undefined;
  };

  /** Live subscription entry. */
  subscribe = (binding: DataBinding): AsyncIterable<T> | undefined => {
    return this.#factory(binding);
  };
}
