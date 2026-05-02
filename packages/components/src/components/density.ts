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

/**
 * Wave 11 / Vis-6 — CSS variable bridge.
 *
 * The render walker emits `data-cir-density="<value>"` on the route's
 * outermost wrapper. The host's `globals.css` declares per-attribute
 * blocks resolving these CSS variables to the matching tier:
 *
 *   :root { --atelier-density-padding: 12px; ... }
 *   [data-cir-density="compact"] { --atelier-density-padding: 4px; ... }
 *   [data-cir-density="spacious"] { --atelier-density-padding: 20px; ... }
 *
 * Components that opt into the variable bridge consume them via
 * `var(--atelier-density-padding)` in their inline styles or class
 * utilities. Non-Tailwind hosts can use the variables directly without
 * pulling the `densityClass` table.
 *
 * The constants below pin the variable NAMES (so renames go through one
 * place) and surface the current per-tier values for tests / hosts that
 * want to project them programmatically.
 */
export const DENSITY_CSS_VAR_NAMES = Object.freeze({
  padding: '--atelier-density-padding',
  rowPadding: '--atelier-density-row-padding',
  gapMultiplier: '--atelier-density-gap-multiplier',
}) as Readonly<Record<'padding' | 'rowPadding' | 'gapMultiplier', string>>;

/**
 * Resolved values per density tier, expressed as CSS-ready strings. Mirrors
 * `DENSITY_PADDING_PX` / `DENSITY_ROW_PADDING_PX` / `DENSITY_GAP_MULTIPLIER`
 * but with `'px'` suffixes (or unit-less for the multiplier) so the values
 * drop into a `style` map without conversion.
 */
export const DENSITY_CSS_VALUES: Readonly<
  Record<Density, Readonly<{ padding: string; rowPadding: string; gapMultiplier: string }>>
> = Object.freeze({
  compact: Object.freeze({
    padding: `${String(DENSITY_PADDING_PX.compact)}px`,
    rowPadding: `${String(DENSITY_ROW_PADDING_PX.compact)}px`,
    gapMultiplier: String(DENSITY_GAP_MULTIPLIER.compact),
  }),
  comfortable: Object.freeze({
    padding: `${String(DENSITY_PADDING_PX.comfortable)}px`,
    rowPadding: `${String(DENSITY_ROW_PADDING_PX.comfortable)}px`,
    gapMultiplier: String(DENSITY_GAP_MULTIPLIER.comfortable),
  }),
  spacious: Object.freeze({
    padding: `${String(DENSITY_PADDING_PX.spacious)}px`,
    rowPadding: `${String(DENSITY_ROW_PADDING_PX.spacious)}px`,
    gapMultiplier: String(DENSITY_GAP_MULTIPLIER.spacious),
  }),
});
