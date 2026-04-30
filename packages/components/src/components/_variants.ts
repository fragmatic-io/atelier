// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Shared variant utilities for `@cir/components`.
 *
 * The package ships zero CSS — components are styled by host adapters via
 * `data-cir-component` and `data-variant` selectors. Even so, components
 * MAY emit a small set of utility class strings (Tailwind-flavoured today)
 * that hosts which DO ship Tailwind can pick up "for free", while a
 * non-Tailwind host simply ignores the unknown classes.
 *
 * This file contains:
 *   - `cn(...)` — tiny class joiner (filters falsy / undefined / null).
 *   - Per-category variant tables (`actionVariantClass`, etc.) keyed by the
 *     variant token we expose on the component prop.
 *
 * No CVA dep. The tables are plain `Object.freeze`'d records. If you need
 * to compose multiple variants per component, use `cn()` to join them.
 */
/** Filter falsy values and join classes with single spaces. */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string | undefined {
  const out = parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
  return out.length > 0 ? out : undefined;
}

// -----------------------------------------------------------------------------
// Action variants (Button, ButtonGroup, ActionMenu)
// -----------------------------------------------------------------------------
export type ActionVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';

export const actionVariantClass: Readonly<Record<ActionVariant, string>> = Object.freeze({
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  ghost: 'bg-transparent text-gray-900 hover:bg-gray-100',
  outline: 'bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-50',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
});

// -----------------------------------------------------------------------------
// Sizes (Button-family + StatCard-family)
// -----------------------------------------------------------------------------
export type Size = 'sm' | 'md' | 'lg';

export const actionSizeClass: Readonly<Record<Size, string>> = Object.freeze({
  sm: 'text-sm px-2 py-1',
  md: 'text-base px-4 py-2',
  lg: 'text-lg px-5 py-3',
});

export const statSizeClass: Readonly<Record<Size, string>> = Object.freeze({
  sm: 'text-sm p-2',
  md: 'text-base p-4',
  lg: 'text-lg p-6',
});

// -----------------------------------------------------------------------------
// Layout-container variants (Stack, Container, Card, Grid, Tabs, Accordion,
// Modal, Drawer)
// -----------------------------------------------------------------------------
export type LayoutVariant = 'bordered' | 'elevated' | 'ghost' | 'tinted';

export const layoutVariantClass: Readonly<Record<LayoutVariant, string>> = Object.freeze({
  bordered: 'border border-gray-200 rounded-md',
  elevated: 'shadow-md rounded-md bg-white',
  ghost: 'bg-transparent',
  tinted: 'bg-gray-50 rounded-md',
});

// -----------------------------------------------------------------------------
// Display variants (Alert, Toast). These mirror the existing `severity` token
// set so authors can write `variant` (canonical going forward) or `severity`
// (legacy alias).
// -----------------------------------------------------------------------------
export type DisplayVariant = 'info' | 'success' | 'warning' | 'error';

export const displayVariantClass: Readonly<Record<DisplayVariant, string>> = Object.freeze({
  info: 'bg-blue-50 text-blue-900 border border-blue-200',
  success: 'bg-green-50 text-green-900 border border-green-200',
  warning: 'bg-amber-50 text-amber-900 border border-amber-200',
  error: 'bg-red-50 text-red-900 border border-red-200',
});

// -----------------------------------------------------------------------------
// Stat / KPI variants (StatCard, KPIRow)
// -----------------------------------------------------------------------------
export type StatVariant = 'default' | 'accent' | 'muted';

export const statVariantClass: Readonly<Record<StatVariant, string>> = Object.freeze({
  default: 'bg-white text-gray-900',
  accent: 'bg-blue-50 text-blue-900',
  muted: 'bg-gray-50 text-gray-600',
});

// -----------------------------------------------------------------------------
// Search variants
// -----------------------------------------------------------------------------
export type SearchVariant = 'default' | 'embedded';

export const searchVariantClass: Readonly<Record<SearchVariant, string>> = Object.freeze({
  default: 'border border-gray-300 rounded-md p-2',
  embedded: 'bg-transparent border-0 p-0',
});

// -----------------------------------------------------------------------------
// Spinner / Progress / Skeleton — these are also display leaves but with the
// layout-style variant set (no severity), since "info" / "success" don't apply
// to a loading indicator. Re-export `LayoutVariant` for clarity.
// -----------------------------------------------------------------------------
export type FeedbackVariant = LayoutVariant;
export const feedbackVariantClass = layoutVariantClass;

// -----------------------------------------------------------------------------
// Markdown / EmptyState / List / Table / DetailView — same set as layout
// containers (these are display containers, not severity-bearing leaves).
// -----------------------------------------------------------------------------
export type ContentVariant = LayoutVariant;
export const contentVariantClass = layoutVariantClass;

// -----------------------------------------------------------------------------
// Tooltip variants — `default` (light surface, dark text) and `inverse`
// (high-contrast, e.g. yellow-on-black for keyboard-shortcut hints).
// -----------------------------------------------------------------------------
export type TooltipVariant = 'default' | 'inverse';

export const tooltipVariantClass: Readonly<Record<TooltipVariant, string>> = Object.freeze({
  default: 'bg-gray-900 text-white text-sm rounded-md px-2 py-1',
  inverse: 'bg-yellow-300 text-black text-sm rounded-md px-2 py-1',
});

// -----------------------------------------------------------------------------
// StatusBar — operational / degraded / incident / maintenance pill, default
// vs compact layout. Vis-9.
// -----------------------------------------------------------------------------
export type StatusBarStatus = 'operational' | 'degraded' | 'incident' | 'maintenance';
export type StatusBarVariant = 'default' | 'compact';

export const statusBarColorClass: Readonly<Record<StatusBarStatus, string>> = Object.freeze({
  operational: 'bg-green-100 text-green-800 ring-1 ring-inset ring-green-200',
  degraded: 'bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-200',
  incident: 'bg-red-100 text-red-800 ring-1 ring-inset ring-red-200',
  maintenance: 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200',
});

export const statusBarVariantClass: Readonly<Record<StatusBarVariant, string>> = Object.freeze({
  default: 'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
  compact: 'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs',
});
