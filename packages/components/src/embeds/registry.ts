// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Cnt-4 — Embed registry.
 *
 * Holds an ordered set of `(provider, resolver)` pairs and dispatches a
 * URL to the first resolver that claims it. Lives in its own file (rather
 * than next to the `EmbedResolver` protocol) because hosts that wire
 * custom resolvers shouldn't need to know about the in-memory registry
 * implementation, and vice-versa: a future Redis-backed cross-process
 * registry would implement `EmbedRegistry` without needing the resolver
 * file changed.
 *
 * Why a separate registry surface (rather than just an array of resolvers)
 * ----------------------------------------------------------------------
 * The `EmbedRegistry` wraps the iteration order under a single named key
 * (the provider). That gives hosts:
 *  1. A stable `provider` string in the resolved tuple — useful for
 *     analytics ("embed.youtube.rendered") and debugging.
 *  2. A natural override point — calling `add('youtube', myCustomResolver)`
 *     replaces the built-in YouTube resolver wholesale.
 *  3. First-match-wins semantics anchored to insertion order, which makes
 *     "register specific resolvers before the oEmbed fallback" the
 *     obvious idiom.
 */
import type { EmbedDisplay, EmbedResolver } from './resolver.js';

/**
 * The registry surface `<Embed>` consumes. Hosts wire one of these (the
 * shipped `InMemoryEmbedRegistry` covers virtually every case) and pass
 * it down via `<Embed registry={…} url={…}>`.
 */
export interface EmbedRegistry {
  /**
   * Register a resolver under a provider key. Re-adding under the same
   * key REPLACES the previous entry — that's the override seam for hosts
   * that want a custom YouTube resolver instead of the built-in.
   */
  add(provider: string, resolver: EmbedResolver): void;
  /**
   * Find the first registered resolver whose `matches(url)` returns true,
   * dispatch to it, and return `{ provider, display }` on success or
   * `null` when no resolver matched / the matched resolver returned
   * `null` / the resolver rejected.
   */
  resolve(url: string): Promise<{ provider: string; display: EmbedDisplay } | null>;
}

/**
 * In-memory registry. Iteration order is insertion order; `add` under an
 * existing key REPLACES (in-place) rather than appending so the iteration
 * order remains predictable.
 *
 * Resolution semantics:
 *  - First resolver whose `matches(url)` returns true is dispatched to.
 *  - That resolver's `null` (or rejection) is the final answer — we do
 *    NOT cascade to the next match. Hosts that want fallback chains
 *    should compose them inside a single resolver, not across the
 *    registry. (The oEmbed resolver is registered LAST so it acts as the
 *    "anything else" catch — if the host wants different ordering, they
 *    register in a different order.)
 */
export class InMemoryEmbedRegistry implements EmbedRegistry {
  private readonly order: string[] = [];
  private readonly byProvider = new Map<string, EmbedResolver>();

  add(provider: string, resolver: EmbedResolver): void {
    if (!this.byProvider.has(provider)) this.order.push(provider);
    this.byProvider.set(provider, resolver);
  }

  /**
   * Test-only / introspection accessor: list providers in iteration
   * order. Not on the `EmbedRegistry` interface so a future custom
   * implementation isn't forced to expose it.
   */
  providers(): readonly string[] {
    return this.order.slice();
  }

  async resolve(url: string): Promise<{ provider: string; display: EmbedDisplay } | null> {
    for (const provider of this.order) {
      const resolver = this.byProvider.get(provider);
      if (!resolver) continue;
      if (!resolver.matches(url)) continue;
      try {
        const ret = resolver.resolve({ url, provider });
        const display = isThenable(ret) ? await ret : ret;
        if (display === null) return null;
        return { provider, display };
      } catch {
        // Resolver rejected — treat as unresolvable. The first matching
        // resolver "owns" the URL; we don't cascade.
        return null;
      }
    }
    return null;
  }
}

function isThenable<T>(v: T | Promise<T>): v is Promise<T> {
  return (
    v !== null && typeof v === 'object' && typeof (v as { then?: unknown }).then === 'function'
  );
}
