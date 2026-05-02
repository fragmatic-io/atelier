// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marigold demo — host-side `ComponentBinding`s.
 *
 * Marketplace pivot — closing chapter. **Marigold ships zero custom
 * bindings.** Mirrors Aurora and Octant: every per-host React tile,
 * queue, detail surface, and wizard has either been promoted to baseline
 * (the `<Queue>` / `<Logo>` promotion) or expressed as composition of
 * existing primitives (`<Stack>` of `<Logo>` + `<NavBar>` + `<StatusBar>`
 * for the chrome; `<Grid data={products}>` over `<Card>` for the catalog;
 * `<Stack>` of `<Gallery>` + `<Card>` + `<DetailView>` for the product
 * page; `<Queue data={cart}>` plus a `<Markdown>` totals line for the
 * cart; `<Stack>` of `<Form>`s for the checkout flow).
 *
 * The runtime registers `COMPONENT_BINDINGS` (the baseline catalog) and
 * spreads this empty record on top — kept so a future host-specific
 * invariant has an obvious place to land without restructuring providers.
 *
 * The `marketplace-pressure` eval gate caps this set's size; this commit
 * lowers the ceiling to 0 to match Aurora and Octant.
 */

import type { ComponentBinding } from '@atelier/runtime';

/**
 * Custom bindings the demo registers on top of `COMPONENT_BINDINGS`.
 * Empty: every Marigold route composes pure baseline primitives. Spread
 * into `MapComponentRegistry` after the baseline so the same wiring
 * point is available to a future host-specific binding.
 */
export const DEMO_DUMMYJSON_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze(
  {},
);

/**
 * Composition-role map derived from `DEMO_DUMMYJSON_BINDINGS`. Threaded
 * onto the `PolicyContext` in `atelier-providers.tsx` so the policy engine
 * treats custom bindings declaring a role as if they were the baseline
 * List/Grid/Table component for composition allow-listing. Empty here —
 * no customs means no role overrides.
 */
export const DEMO_DUMMYJSON_COMPOSITION_ROLES: Readonly<Record<string, 'list' | 'grid' | 'table'>> =
  Object.freeze({});
