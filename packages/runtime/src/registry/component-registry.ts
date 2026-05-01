// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Component registry — the runtime's lookup table from `componentId` (as
 * declared in a manifest's `LayoutNode.component`) to a framework-specific
 * `factory`. The runtime treats `factory` as opaque; only the adapter (Phase
 * 4b: React, native, voice, ...) cares about its shape.
 *
 * The interface is intentionally minimal — no registration API. Most hosts
 * build a registry once at boot and never mutate it. Tests can implement
 * the interface inline; an `EMPTY_REGISTRY` value exists for the
 * "I-have-no-components-yet" path the renderer takes when the manifest
 * references a name the host hasn't shipped (it falls through to a fallback
 * UI rather than crashing).
 *
 * Component impls live in `@cir/components` (Phase 4b). Do NOT add
 * implementations here.
 */

/**
 * Composition role a binding plays in policy / layout reasoning.
 *
 * Baseline catalog components (`List`, `Table`, `Grid`) are always treated
 * as their nominal role. Custom bindings — e.g. `IssueQueue`, `RepoTable`,
 * `KanbanBoard` — can opt into one of these roles so the policy engine
 * applies the same composition rules (long-list hierarchy treatment,
 * empty/loading/error obligations, etc.) to them as it would to the
 * baseline component of the same role.
 *
 * `undefined` means "no role" — the binding is not subject to role-driven
 * policy obligations. This keeps the field strictly opt-in and backwards
 * compatible: existing bindings without `compositionRole` are unaffected.
 *
 * Source: Wave 8 / E-A — `apps/demo-github` showcase work needed
 * `<IssueQueue>` to be policy-equivalent to `<List>` for the
 * `composes_hierarchy_for_long_lists` and `empty_loading_error_handled`
 * checks. The role mechanism is the architecturally correct way to admit
 * custom bindings into those policies without growing per-policy
 * allow-lists.
 */
export type CompositionRole = 'list' | 'grid' | 'table';

/**
 * One bound component. `factory` is opaque to the runtime — it could be a
 * React component, a Vue component, a native bridge handle, etc.
 */
export interface ComponentBinding {
  id: string;
  /** Framework-specific factory the adapter hands to its renderer. */
  factory: unknown;
  /**
   * Optional composition role. When present, the policy engine treats this
   * binding as equivalent to the baseline component of the same role for
   * the purposes of the composition policies. See `CompositionRole`.
   */
  compositionRole?: CompositionRole;
}

export interface ComponentRegistry {
  has(componentId: string): boolean;
  get(componentId: string): ComponentBinding | undefined;
  list(): readonly string[];
}

/** A registry that never resolves any component. Default for tests. */
export const EMPTY_REGISTRY: ComponentRegistry = Object.freeze({
  has(): boolean {
    return false;
  },
  get(): ComponentBinding | undefined {
    return undefined;
  },
  list(): readonly string[] {
    return Object.freeze([]);
  },
});

/**
 * Convenience builder for hosts that want to assemble a registry from a
 * record of bindings. Implementations are free to wire their own (e.g. a
 * lazy registry that resolves on first `get`).
 */
export class MapComponentRegistry implements ComponentRegistry {
  readonly #bindings: Map<string, ComponentBinding>;

  constructor(initial: Readonly<Record<string, ComponentBinding>> = {}) {
    this.#bindings = new Map(Object.entries(initial));
  }

  /** Add or overwrite a binding. Returns `this` for chaining. */
  register(binding: ComponentBinding): this {
    this.#bindings.set(binding.id, binding);
    return this;
  }

  has(componentId: string): boolean {
    return this.#bindings.has(componentId);
  }

  get(componentId: string): ComponentBinding | undefined {
    return this.#bindings.get(componentId);
  }

  list(): readonly string[] {
    return [...this.#bindings.keys()];
  }
}

/**
 * Build a `componentId -> CompositionRole` map by scanning a registry-like
 * `Record<string, ComponentBinding>`. Bindings without a `compositionRole`
 * are omitted so the resulting record stays minimal. Convenience for hosts
 * that pass the map into `PolicyContext.composition_roles`.
 */
export function compositionRolesFromBindings(
  bindings: Readonly<Record<string, ComponentBinding>>,
): Readonly<Record<string, CompositionRole>> {
  const out: Record<string, CompositionRole> = {};
  for (const [id, binding] of Object.entries(bindings)) {
    if (binding.compositionRole !== undefined) out[id] = binding.compositionRole;
  }
  return out;
}
