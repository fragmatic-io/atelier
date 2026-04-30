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
// CodeBlock variants — `default` is a standalone block (rounded card with
// padding and a top margin), `embedded` is a tighter inline-block flavour
// suitable for embedding within prose / chat messages.
// -----------------------------------------------------------------------------
export type CodeBlockVariant = 'default' | 'embedded';

export const codeBlockVariantClass: Readonly<Record<CodeBlockVariant, string>> = Object.freeze({
  default: 'bg-gray-50 text-gray-900 rounded-md p-3 my-2 text-sm font-mono overflow-x-auto',
  embedded:
    'bg-gray-100 text-gray-900 rounded p-2 text-xs font-mono inline-block max-w-full overflow-x-auto',
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
// HoverCard variants — `default` (rich preview surface, light) and
// `compact` (smaller padding for dense list rows). Wave 7b / Int-13.
// -----------------------------------------------------------------------------
export type HoverCardVariant = 'default' | 'compact';

export const hoverCardVariantClass: Readonly<Record<HoverCardVariant, string>> = Object.freeze({
  default: 'bg-white text-gray-900 rounded-lg shadow-lg ring-1 ring-gray-200 p-4',
  compact: 'bg-white text-gray-900 rounded-md shadow-md ring-1 ring-gray-200 p-2',
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

// -----------------------------------------------------------------------------
// BulkActionBar — floating bar at bottom-center while a multi-select is
// active. Wave 7b / Int-9.
// -----------------------------------------------------------------------------
export type BulkActionBarVariant = 'default';

export const bulkActionBarVariantClass: Readonly<Record<BulkActionBarVariant, string>> =
  Object.freeze({
    default:
      'fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-full shadow-2xl px-4 py-2 flex items-center gap-3 z-50',
  });

// -----------------------------------------------------------------------------
// Pinned-item separator (List, Table — Wave 7b / Nav-3). The thin divider
// rendered between the pinned block and the unpinned block. `default` is the
// standard 1-px gray-300 line; `subtle` is a lighter gray-200 with smaller
// vertical margin for dense / compact layouts.
// -----------------------------------------------------------------------------
export type PinnedSeparatorVariant = 'default' | 'subtle';
export const pinnedSeparatorClass: Readonly<Record<PinnedSeparatorVariant, string>> = Object.freeze(
  {
    default: 'border-b border-gray-300 my-2',
    subtle: 'border-b border-gray-200 my-1',
  },
);

// -----------------------------------------------------------------------------
// Icon sizes — Wave 7b (Vis-3). Five-step px scale used by `<Icon>` consumers
// (Button leading icons, Alert severity icons, EmptyState illustrations) so
// every surface picks a size from one table. The raw `<Icon size={…}>` prop
// still accepts arbitrary pixel numbers; this map is the canonical scale.
// -----------------------------------------------------------------------------
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const iconSizePx: Readonly<Record<IconSize, number>> = Object.freeze({
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
});
