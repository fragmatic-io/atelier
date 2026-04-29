// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `PolicyRegistry` — mutable container of named policies for apps that
 * compose custom policies on top of the baseline.
 *
 * `BASELINE_POLICIES` is a fixed `readonly` const; apps that ship custom
 * validators (e.g. `respects_org_chart`, `no_links_to_archived_threads`)
 * previously had to hand-merge the baseline with their additions every time
 * they called `validateManifest`. The registry centralizes that pattern.
 *
 * Convention: registering with the same `id` REPLACES the existing entry
 * (last write wins). Mirrors `ActionRegistry` in `@cir/runtime` so apps
 * have one mental model for "registry".
 *
 * Typical usage:
 *
 * ```ts
 * const registry = new PolicyRegistry();
 * registry.register(myCustomPolicy);
 * const result = validateManifest(ctx, { policies: registry.all() });
 * ```
 */

import type { NamedPolicy } from './result.js';
import { BASELINE_POLICIES } from './validate.js';

export class PolicyRegistry {
  readonly #policies = new Map<string, NamedPolicy>();

  /**
   * @param initial Seed policies. Defaults to `BASELINE_POLICIES`. Pass `[]`
   *   to start from an empty registry.
   */
  constructor(initial: readonly NamedPolicy[] = BASELINE_POLICIES) {
    for (const p of initial) this.#policies.set(p.id, p);
  }

  /** Register or replace a policy by `id` (last write wins). */
  register(policy: NamedPolicy): void {
    this.#policies.set(policy.id, policy);
  }

  /** Remove a policy by `id`. Returns true if a policy was deleted. */
  unregister(id: string): boolean {
    return this.#policies.delete(id);
  }

  /** Look up a policy by `id`. */
  get(id: string): NamedPolicy | undefined {
    return this.#policies.get(id);
  }

  /** Snapshot of all registered policies, in insertion order. */
  all(): readonly NamedPolicy[] {
    return [...this.#policies.values()];
  }

  /** True iff a policy with this `id` is registered. */
  has(id: string): boolean {
    return this.#policies.has(id);
  }
}
