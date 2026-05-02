// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Density — the personalisation signal that compresses or relaxes layout
 * spacing in the components that render multiple children. The catalog
 * supports three values matching `intent.global_preferences.density` from
 * `@atelier/schemas`:
 *
 *   - `'compact'`  — tight spacing for power users / dense data displays.
 *   - `'comfortable'` — the default for everyone else.
 *   - `'spacious'` — relaxed spacing for accessibility-leaning users.
 *
 * The renderer (`@atelier/react`'s `<RenderNode>` walker) reads
 * `intent.global_preferences.density` and threads it down as the default for
 * any component that accepts the prop. Components only need to translate the
 * value into pixel/spacing tokens; they never read intent directly.
 *
 * The maps below are the canonical mapping. Adapters MAY remap via CSS but
 * the px values are the source of truth for layout spacing on the 8 layout
 * components that accept `density` today: Stack, Container, Card, Grid, List,
 * Table, StatCard, KPIRow.
 */

export type Density = 'compact' | 'comfortable' | 'spacious';

/**
 * Gap multiplier applied on top of a component's existing gap token. A Stack
 * with `gap='md'` (16px) at compact density renders 8px; at spacious it
 * renders 24px.
 */
export const DENSITY_GAP_MULTIPLIER: Readonly<Record<Density, number>> = Object.freeze({
  compact: 0.5,
  comfortable: 1,
  spacious: 1.5,
});

/** Vertical padding used by Card and Container (in px). */
export const DENSITY_PADDING_PX: Readonly<Record<Density, number>> = Object.freeze({
  compact: 4,
  comfortable: 12,
  spacious: 20,
});

/** Row vertical padding used by List, Table, StatCard. */
export const DENSITY_ROW_PADDING_PX: Readonly<Record<Density, number>> = Object.freeze({
  compact: 2,
  comfortable: 8,
  spacious: 14,
});

export const DEFAULT_DENSITY: Density = 'comfortable';

/**
 * Apply the density multiplier to a gap value. `null` is returned untouched
 * so callers that want to honour `gap: undefined` can keep doing so.
 */
export function densityScaleGapPx(basePx: number, density: Density | undefined): number {
  const d = density ?? DEFAULT_DENSITY;
  return Math.round(basePx * DENSITY_GAP_MULTIPLIER[d]);
}
