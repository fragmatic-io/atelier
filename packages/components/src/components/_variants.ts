// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Shared variant utilities for `@atelier/components`.
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
 *
 * ## Dark mode (Vis-2)
 *
 * Every variant table entry below is dual-toned: a light-mode set of
 * Tailwind utilities followed by `dark:`-prefixed siblings. Hosts that
 * configure Tailwind with
 * `darkMode: ['class', '[data-color-mode="dark"]']` (or the older `'class'`
 * strategy combined with toggling `class="dark"` on `<html>`) get a working
 * pair-tested dark theme out of the box. The runtime mirrors
 * `intent.global_preferences.color_mode` onto `<html data-color-mode>` from
 * `@atelier/react`'s `<CirRoute>` so the selector matches automatically.
 *
 * Hosts that do NOT ship Tailwind ignore the unknown classes — both the
 * light and dark utilities are no-ops in that case.
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
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400',
  secondary:
    'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
  ghost: 'bg-transparent text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800',
  outline:
    'bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-50 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-800',
  destructive:
    'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-white dark:hover:bg-red-400',
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
  bordered: 'border border-gray-200 rounded-md dark:border-gray-700',
  elevated: 'shadow-md rounded-md bg-white dark:bg-gray-900 dark:shadow-black/40',
  ghost: 'bg-transparent',
  tinted: 'bg-gray-50 rounded-md dark:bg-gray-800',
});

// -----------------------------------------------------------------------------
// Display variants (Alert, Toast). These mirror the existing `severity` token
// set so authors can write `variant` (canonical going forward) or `severity`
// (legacy alias).
// -----------------------------------------------------------------------------
export type DisplayVariant = 'info' | 'success' | 'warning' | 'error';

export const displayVariantClass: Readonly<Record<DisplayVariant, string>> = Object.freeze({
  info: 'bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-900',
  success:
    'bg-green-50 text-green-900 border border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-900',
  warning:
    'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-900',
  error:
    'bg-red-50 text-red-900 border border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-900',
});

// -----------------------------------------------------------------------------
// Toast variants — superset of the Display variants plus `'undo'`. Wave 11 /
// Int-8 ships the `'undo'` variant: a dark surface with a countdown progress
// bar and a paired `Undo` button. The dark surface mirrors Linear's "Action
// undone" toast — high-contrast on top of any route.
// -----------------------------------------------------------------------------
export type ToastVariant = DisplayVariant | 'undo';

export const toastVariantClass: Readonly<Record<ToastVariant, string>> = Object.freeze({
  ...displayVariantClass,
  undo: 'bg-gray-900 text-white border border-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-300',
});

// -----------------------------------------------------------------------------
// MetaBadge variants — small inline status pill (count, label, severity, or
// "live"/"unread" indicator). Reuses `displayVariantClass` for info/success/
// warning/error severities; `default` is a neutral gray pill, and `live`
// adds a cyan accent for "live" / streaming / unread indicators.
// -----------------------------------------------------------------------------
export type MetaBadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'live';

export const metaBadgeVariantClass: Readonly<Record<MetaBadgeVariant, string>> = Object.freeze({
  default:
    'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700',
  info: 'bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-900',
  success:
    'bg-green-50 text-green-900 border border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-900',
  warning:
    'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-900',
  danger:
    'bg-red-50 text-red-900 border border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-900',
  live: 'bg-cyan-50 text-cyan-900 border border-cyan-200 dark:bg-cyan-950 dark:text-cyan-100 dark:border-cyan-900',
});

// -----------------------------------------------------------------------------
// Stat / KPI variants (StatCard, KPIRow)
// -----------------------------------------------------------------------------
export type StatVariant = 'default' | 'accent' | 'muted';

export const statVariantClass: Readonly<Record<StatVariant, string>> = Object.freeze({
  default: 'bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100',
  accent: 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  muted: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
});

// -----------------------------------------------------------------------------
// Search variants
// -----------------------------------------------------------------------------
export type SearchVariant = 'default' | 'embedded';

export const searchVariantClass: Readonly<Record<SearchVariant, string>> = Object.freeze({
  default:
    'border border-gray-300 rounded-md p-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100',
  embedded: 'bg-transparent border-0 p-0 dark:text-gray-100',
});

// -----------------------------------------------------------------------------
// CodeBlock variants — `default` is a standalone block (rounded card with
// padding and a top margin), `embedded` is a tighter inline-block flavour
// suitable for embedding within prose / chat messages.
// -----------------------------------------------------------------------------
export type CodeBlockVariant = 'default' | 'embedded';

export const codeBlockVariantClass: Readonly<Record<CodeBlockVariant, string>> = Object.freeze({
  default:
    'bg-gray-50 text-gray-900 rounded-md p-3 my-2 text-sm font-mono overflow-x-auto dark:bg-gray-900 dark:text-gray-100',
  embedded:
    'bg-gray-100 text-gray-900 rounded p-2 text-xs font-mono inline-block max-w-full overflow-x-auto dark:bg-gray-800 dark:text-gray-100',
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
  default:
    'bg-gray-900 text-white text-sm rounded-md px-2 py-1 dark:bg-gray-100 dark:text-gray-900',
  inverse:
    'bg-yellow-300 text-black text-sm rounded-md px-2 py-1 dark:bg-yellow-400 dark:text-black',
});

// -----------------------------------------------------------------------------
// HoverCard variants — `default` (rich preview surface, light) and
// `compact` (smaller padding for dense list rows). Wave 7b / Int-13.
// -----------------------------------------------------------------------------
export type HoverCardVariant = 'default' | 'compact';

export const hoverCardVariantClass: Readonly<Record<HoverCardVariant, string>> = Object.freeze({
  default:
    'bg-white text-gray-900 rounded-lg shadow-lg ring-1 ring-gray-200 p-4 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 dark:shadow-black/40',
  compact:
    'bg-white text-gray-900 rounded-md shadow-md ring-1 ring-gray-200 p-2 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 dark:shadow-black/40',
});

// -----------------------------------------------------------------------------
// StatusBar — operational / degraded / incident / maintenance pill, default
// vs compact layout. Vis-9.
// -----------------------------------------------------------------------------
export type StatusBarStatus = 'operational' | 'degraded' | 'incident' | 'maintenance';
export type StatusBarVariant = 'default' | 'compact';

export const statusBarColorClass: Readonly<Record<StatusBarStatus, string>> = Object.freeze({
  operational:
    'bg-green-100 text-green-800 ring-1 ring-inset ring-green-200 dark:bg-green-950 dark:text-green-200 dark:ring-green-900',
  degraded:
    'bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:ring-yellow-900',
  incident:
    'bg-red-100 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900',
  maintenance:
    'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-900',
});

export const statusBarVariantClass: Readonly<Record<StatusBarVariant, string>> = Object.freeze({
  default: 'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm dark:text-gray-100',
  compact: 'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs dark:text-gray-100',
});

// -----------------------------------------------------------------------------
// BulkActionBar — floating bar at bottom-center while a multi-select is
// active. Wave 7b / Int-9.
// -----------------------------------------------------------------------------
export type BulkActionBarVariant = 'default';

export const bulkActionBarVariantClass: Readonly<Record<BulkActionBarVariant, string>> =
  Object.freeze({
    default:
      'fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-full shadow-2xl px-4 py-2 flex items-center gap-3 z-50 dark:bg-gray-100 dark:text-gray-900 dark:shadow-black/60',
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
    default: 'border-b border-gray-300 my-2 dark:border-gray-600',
    subtle: 'border-b border-gray-200 my-1 dark:border-gray-700',
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

// -----------------------------------------------------------------------------
// Vis-4 — variant tables for the remaining 32 components. P-10 covered the 24
// most-impactful primitives; Vis-4 closes the gap with input-style, navigation,
// chart, and specialized variants. Tables below are all NEW; do not edit the
// existing tables above — Vis-2 owns those for dark-mode work.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Input variants (TextInput, NumberInput, DateInput, TimeInput, MultiSelect,
// Toggle, Slider, FileUpload, RichText, CodeEditor, Calendar). Same three-step
// shape as `searchVariantClass`: a default bordered field, an `embedded`
// flavour (no chrome, for inputs hosted inside a styled container), and a
// `minimal` underline flavour (Material-like dense forms).
// -----------------------------------------------------------------------------
export type InputVariant = 'default' | 'embedded' | 'minimal';

export const inputVariantClass: Readonly<Record<InputVariant, string>> = Object.freeze({
  default: 'border border-gray-300 rounded-md p-2 text-sm',
  embedded: 'bg-transparent border-0 p-0 text-sm',
  minimal: 'border-0 border-b border-gray-300 rounded-none p-1 text-sm',
});

// -----------------------------------------------------------------------------
// Navigation variants (Breadcrumb, Pagination, Sidebar). Sizes already exist on
// these via component-specific props; the variant axis adds chrome intensity:
// `default` is the standard surface, `subtle` drops emphasis for chrome that
// blends into the page, and `inverse` flips contrast for dark navigation rails
// laid over light page content.
// -----------------------------------------------------------------------------
export type NavigationVariant = 'default' | 'subtle' | 'inverse';

export const navigationVariantClass: Readonly<Record<NavigationVariant, string>> = Object.freeze({
  default: 'text-gray-900',
  subtle: 'text-gray-500',
  inverse: 'bg-gray-900 text-white',
});

// -----------------------------------------------------------------------------
// ConfirmDialog — `default` (neutral confirmation surface) vs `destructive`
// (red-tinted ring so the dialog itself signals risk before the user reaches
// the action button). The existing `destructive` boolean prop continues to
// work and is wired to default the variant to `'destructive'` for back-compat.
// -----------------------------------------------------------------------------
export type ConfirmDialogVariant = 'default' | 'destructive';

export const confirmDialogVariantClass: Readonly<Record<ConfirmDialogVariant, string>> =
  Object.freeze({
    default: 'bg-white text-gray-900 rounded-md shadow-lg ring-1 ring-gray-200 p-4',
    destructive: 'bg-white text-gray-900 rounded-md shadow-lg ring-1 ring-red-300 p-4',
  });

// -----------------------------------------------------------------------------
// Form — visual rhythm of the form's vertical gap stack. `compact` halves the
// gap for tight settings panels; `spacious` doubles it for hero-style flows.
// (Density is a separate axis owned by the existing density token.)
// -----------------------------------------------------------------------------
export type FormVariant = 'default' | 'compact' | 'spacious';

export const formVariantClass: Readonly<Record<FormVariant, string>> = Object.freeze({
  default: 'flex flex-col gap-4',
  compact: 'flex flex-col gap-2',
  spacious: 'flex flex-col gap-6',
});

// -----------------------------------------------------------------------------
// Wizard — layout style of the step strip. `default` is the inline stepper
// above the content; `sidebar` floats steps to the left as a vertical column;
// `inline` collapses the strip to a one-line breadcrumb of titles.
// -----------------------------------------------------------------------------
export type WizardVariant = 'default' | 'sidebar' | 'inline';

export const wizardVariantClass: Readonly<Record<WizardVariant, string>> = Object.freeze({
  default: 'flex flex-col gap-4',
  sidebar: 'grid grid-cols-[200px_1fr] gap-4',
  inline: 'flex flex-col gap-2',
});

// -----------------------------------------------------------------------------
// FilterBar — chip-row, inline-form, or sidebar facet column. Each picks a
// completely different layout: chips wrap, inline lays out horizontally, and
// sidebar stacks vertically.
// -----------------------------------------------------------------------------
export type FilterBarVariant = 'chip' | 'inline' | 'sidebar';

export const filterBarVariantClass: Readonly<Record<FilterBarVariant, string>> = Object.freeze({
  chip: 'flex flex-wrap items-center gap-2',
  inline: 'flex items-center gap-3',
  sidebar: 'flex flex-col gap-3',
});

// -----------------------------------------------------------------------------
// Gallery — visual layout. `grid` is the default uniform grid; `masonry` flows
// items into a column-count layout for varying heights; `carousel` is a single
// horizontal scroller.
// -----------------------------------------------------------------------------
export type GalleryVariant = 'grid' | 'masonry' | 'carousel';

export const galleryVariantClass: Readonly<Record<GalleryVariant, string>> = Object.freeze({
  grid: 'grid gap-3',
  masonry: 'columns-3 gap-3',
  carousel: 'flex gap-3 overflow-x-auto snap-x snap-mandatory',
});

// -----------------------------------------------------------------------------
// CommandPalette — `default` (full-height modal with breathing room) and
// `compact` (smaller surface for inline pickers / quick-jump menus).
// -----------------------------------------------------------------------------
export type CommandPaletteVariant = 'default' | 'compact';

export const commandPaletteVariantClass: Readonly<Record<CommandPaletteVariant, string>> =
  Object.freeze({
    default: 'bg-white text-gray-900 rounded-lg shadow-xl ring-1 ring-gray-200 p-3 w-[480px]',
    compact: 'bg-white text-gray-900 rounded-md shadow-md ring-1 ring-gray-200 p-2 w-[320px]',
  });

// -----------------------------------------------------------------------------
// QuickSwitcher — Wave 11 / Int-6. Same visual surface as CommandPalette
// (a dialog-backed list with a search input) but indexed against resources
// instead of actions. We share the variant classes deliberately so hosts
// that style one get the other for free.
// -----------------------------------------------------------------------------
export type QuickSwitcherVariant = 'default' | 'compact';

export const quickSwitcherVariantClass: Readonly<Record<QuickSwitcherVariant, string>> =
  Object.freeze({
    default: 'bg-white text-gray-900 rounded-lg shadow-xl ring-1 ring-gray-200 p-3 w-[480px]',
    compact: 'bg-white text-gray-900 rounded-md shadow-md ring-1 ring-gray-200 p-2 w-[320px]',
  });

// -----------------------------------------------------------------------------
// BlockMenu — Wave 11 / Cnt-6. Inline slash-command menu anchored next to the
// editor caret (Notion / Linear / Coda pattern). `default` is the floating
// popover surface; `compact` trims the padding for chat / comment surfaces
// where vertical space is tight.
// -----------------------------------------------------------------------------
export type BlockMenuVariant = 'default' | 'compact';

export const blockMenuVariantClass: Readonly<Record<BlockMenuVariant, string>> = Object.freeze({
  default:
    'bg-white text-gray-900 rounded-md ring-1 ring-gray-200 p-2 w-[320px] dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700',
  compact:
    'bg-white text-gray-900 rounded-md ring-1 ring-gray-200 p-1 w-[260px] text-sm dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700',
});

// -----------------------------------------------------------------------------
// SettingsSearch — Wave 11 / Int-12. Inline search box rendered at the top of
// a settings surface (Stripe / Slack / Notion all ship one). `default` is the
// full-width inline panel that grows with the container; `compact` trims the
// padding for narrower side-rails. Visually distinct from CommandPalette
// because it isn't a dialog — it sits in the page flow.
// -----------------------------------------------------------------------------
export type SettingsSearchVariant = 'default' | 'compact';

export const settingsSearchVariantClass: Readonly<Record<SettingsSearchVariant, string>> =
  Object.freeze({
    default:
      'bg-white text-gray-900 rounded-md ring-1 ring-gray-200 p-3 w-full dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700',
    compact:
      'bg-white text-gray-900 rounded-md ring-1 ring-gray-200 p-2 w-full text-sm dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700',
  });

// -----------------------------------------------------------------------------
// ScopeSwitcher — Wave 11 / Nav-5. Top-left chrome scope switcher (Vercel /
// Supabase / Linear ship one). `default` is the standard popover anchored
// under the trigger button; `compact` trims the trigger padding for tighter
// chrome. Visually distinct from CommandPalette — this is a popover, not a
// dialog, and lives inline in the chrome.
// -----------------------------------------------------------------------------
export type ScopeSwitcherVariant = 'default' | 'compact';

export const scopeSwitcherTriggerVariantClass: Readonly<Record<ScopeSwitcherVariant, string>> =
  Object.freeze({
    default:
      'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium bg-white text-gray-900 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 dark:hover:bg-gray-800',
    compact:
      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-white text-gray-900 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 dark:hover:bg-gray-800',
  });

export const scopeSwitcherPopoverVariantClass: Readonly<Record<ScopeSwitcherVariant, string>> =
  Object.freeze({
    default:
      'bg-white text-gray-900 rounded-md ring-1 ring-gray-200 p-2 w-[320px] dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700',
    compact:
      'bg-white text-gray-900 rounded-md ring-1 ring-gray-200 p-1 w-[240px] text-xs dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700',
  });

// -----------------------------------------------------------------------------
// Stepper — layout / display style. `horizontal` is the default flex-row,
// `vertical` stacks for sidebars, `numbered` strips the connector and leans on
// the index numerals.
// -----------------------------------------------------------------------------
export type StepperVariant = 'horizontal' | 'vertical' | 'numbered';

export const stepperVariantClass: Readonly<Record<StepperVariant, string>> = Object.freeze({
  horizontal: 'flex flex-row items-center gap-3',
  vertical: 'flex flex-col gap-3',
  numbered: 'flex flex-row items-center gap-2',
});

// -----------------------------------------------------------------------------
// Chart — axis + grid intensity. `default` shows axes + tick labels;
// `minimal` drops the labels (axis lines stay); `sparkline` strips chrome
// entirely so the chart is just the data path, suitable for inline cells.
// -----------------------------------------------------------------------------
export type ChartVariant = 'default' | 'minimal' | 'sparkline';

export const chartVariantClass: Readonly<Record<ChartVariant, string>> = Object.freeze({
  default: 'text-gray-700',
  minimal: 'text-gray-500',
  sparkline: 'text-blue-600',
});

// -----------------------------------------------------------------------------
// Timeline — vertical rhythm. `compact` halves the gap; `sparse` doubles it.
// -----------------------------------------------------------------------------
export type TimelineVariant = 'default' | 'compact' | 'sparse';

export const timelineVariantClass: Readonly<Record<TimelineVariant, string>> = Object.freeze({
  default: 'flex flex-col gap-3',
  compact: 'flex flex-col gap-1',
  sparse: 'flex flex-col gap-6',
});

// -----------------------------------------------------------------------------
// Tree — `default` standard padding, `condensed` tighter row height for deep
// nested trees that would otherwise scroll a lot.
// -----------------------------------------------------------------------------
export type TreeVariant = 'default' | 'condensed';

export const treeVariantClass: Readonly<Record<TreeVariant, string>> = Object.freeze({
  default: 'text-sm',
  condensed: 'text-xs leading-tight',
});

// -----------------------------------------------------------------------------
// ChatThread — `default` is full-width bubbles, `compact` tightens spacing,
// `split` lays out user / assistant messages on opposite sides of a divider.
// -----------------------------------------------------------------------------
export type ChatThreadVariant = 'default' | 'compact' | 'split';

export const chatThreadVariantClass: Readonly<Record<ChatThreadVariant, string>> = Object.freeze({
  default: 'flex flex-col gap-3',
  compact: 'flex flex-col gap-1',
  split: 'flex flex-col gap-3',
});

// -----------------------------------------------------------------------------
// Map — `default` shows header + marker list, `minimal` strips the chrome to
// a borderless surface (host paints the tiles themselves).
// -----------------------------------------------------------------------------
export type MapVariant = 'default' | 'minimal';

export const mapVariantClass: Readonly<Record<MapVariant, string>> = Object.freeze({
  default: 'border border-gray-200 rounded-md p-2',
  minimal: 'p-0',
});

// -----------------------------------------------------------------------------
// Kanban — `default` standard column padding, `compact` tighter rhythm so more
// cards fit on a single screen.
// -----------------------------------------------------------------------------
export type KanbanVariant = 'default' | 'compact';

export const kanbanVariantClass: Readonly<Record<KanbanVariant, string>> = Object.freeze({
  default: 'flex gap-3 overflow-x-auto',
  compact: 'flex gap-2 overflow-x-auto text-sm',
});

// -----------------------------------------------------------------------------
// DiffView — `unified` default GitHub-style stacked, `split` two-column, and
// `minimal` strips the gutter and renders just the line content.
// -----------------------------------------------------------------------------
export type DiffViewVariant = 'unified' | 'split' | 'minimal';

export const diffViewVariantClass: Readonly<Record<DiffViewVariant, string>> = Object.freeze({
  unified: 'font-mono text-sm',
  split: 'font-mono text-sm grid grid-cols-2 gap-4',
  minimal: 'font-mono text-xs',
});

// -----------------------------------------------------------------------------
// ActivityFeed — `default` is a vertical list with avatar gutter, `compact`
// tightens the row rhythm (Linear-style dense feed), `cards` wraps each event
// in a bordered surface (Stripe events log).
// -----------------------------------------------------------------------------
export type ActivityFeedVariant = 'default' | 'compact' | 'cards';

export const activityFeedVariantClass: Readonly<Record<ActivityFeedVariant, string>> =
  Object.freeze({
    default: 'flex flex-col gap-3',
    compact: 'flex flex-col gap-1 text-sm',
    cards: 'flex flex-col gap-2',
  });

// -----------------------------------------------------------------------------
// CodeView — `default` standalone block, `embedded` inline-block flavour
// suitable for inline code references, `numbered` always shows line numbers.
// -----------------------------------------------------------------------------
export type CodeViewVariant = 'default' | 'embedded' | 'numbered';

export const codeViewVariantClass: Readonly<Record<CodeViewVariant, string>> = Object.freeze({
  default: 'bg-gray-50 rounded-md p-3 text-sm font-mono overflow-x-auto',
  embedded: 'bg-gray-100 rounded p-2 text-xs font-mono inline-block max-w-full overflow-x-auto',
  numbered: 'bg-gray-50 rounded-md p-3 text-sm font-mono overflow-x-auto',
});

// -----------------------------------------------------------------------------
// Elevation scale — Wave 11 / Vis-7. Five canonical levels mirror
// `BrandKit.elevation_scale` (`resting` / `hover` / `popover` / `modal` /
// `commandbar`). Components consume this map via `cn(..., elevationClass[level])`
// AND emit `data-elevation={level}` so hosts can opt for the CSS-variable
// bridge (`box-shadow: var(--cir-shadow-{level})`) instead of (or alongside)
// the Tailwind classes.
//
// The Tailwind class strings below are the no-CSS-config fallback: hosts that
// pull our published `tailwind.config.mjs` template get a working dark/light
// pair via the `--cir-shadow-{level}` variables that template registers under
// `theme.extend.boxShadow`. Hosts that ship neither Tailwind nor the CSS
// variables get a sensible default shadow ramp via Tailwind's built-ins.
// -----------------------------------------------------------------------------
export type Elevation = 'resting' | 'hover' | 'popover' | 'modal' | 'commandbar';

export const elevationClass: Readonly<Record<Elevation, string>> = Object.freeze({
  resting: '',
  hover: 'shadow-sm',
  popover: 'shadow-md',
  modal: 'shadow-lg',
  commandbar: 'shadow-xl',
});

/**
 * Frozen tuple of every elevation level in canonical order. Mirrors
 * `ElevationKey` from `@atelier/schemas` — duplicated here as a value so the
 * components package does not pull a runtime dependency on schemas just for
 * the iteration.
 */
export const ELEVATION_LEVELS: readonly Elevation[] = Object.freeze([
  'resting',
  'hover',
  'popover',
  'modal',
  'commandbar',
] as const);

// -----------------------------------------------------------------------------
// Density (Wave 11 / Vis-6) — three-tier rhythm: compact / comfortable /
// spacious. Components emit `data-cir-density={value}` AND opt into this map
// so Tailwind hosts get a sensible default rhythm for free; non-Tailwind hosts
// rely on the CSS variables (`--atelier-density-padding`,
// `--atelier-density-row-padding`, `--atelier-density-gap-multiplier`)
// projected on the route's outermost wrapper.
//
// The Tailwind utility strings deliberately stay simple — `p-{n}` and
// `gap-{n}` only — so the multipliers do not collide with per-component layout
// utilities. Authors compose the class via `cn(densityClass[d], className)`.
// -----------------------------------------------------------------------------
export type Density = 'compact' | 'comfortable' | 'spacious';

export const densityClass: Readonly<Record<Density, string>> = Object.freeze({
  compact: 'p-1 gap-1',
  comfortable: 'p-3 gap-3',
  spacious: 'p-5 gap-6',
});

/**
 * Frozen set of canonical component IDs that consume density via the
 * personalisation pipeline. The render walker uses this list to know which
 * components to default the prop on; manifests can list the same ids when
 * declaring custom binding metadata. New density-aware components must be
 * added here AND must accept a `density?: Density` prop.
 *
 * Why a set in a value module: the React renderer (`@atelier/react`) consumes
 * this list for its walker. Centralising here keeps the component package as
 * the single source of truth for "what is density-aware" — schemas + react
 * import from one place rather than re-declaring.
 */
export const DENSITY_AWARE_COMPONENTS: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    'Stack',
    'Container',
    'Card',
    'Grid',
    'List',
    'Table',
    'Queue',
    'KPIRow',
    'StatCard',
    'DetailView',
    'Skeleton',
    'VirtualList',
    'VirtualTable',
  ]),
);
