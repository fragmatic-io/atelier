// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Composition rules table — pure data, no React imports.
 *
 * `registry.ts` re-exports this so existing consumers stay unchanged.
 * The reason this file exists separately is that the Gemini compiler's
 * post-output validator runs in a Next.js server route (no React
 * runtime), and importing from `@atelier/components/registry` (or the index)
 * transitively pulls in `Icon` → `IconBrandContext` → `createContext`,
 * which Next forbids on the server.
 *
 * This subpath export (`@atelier/components/composition-rules`) is the
 * server-safe entry. Phase 1.5 (Dynamic UI Activation) added it.
 */
export interface CompositionRule {
  can_contain: '*' | 'leaf' | readonly string[];
  min_children?: number;
  max_children?: number;
}

export const COMPOSITION_RULES: Readonly<Record<string, CompositionRule>> = Object.freeze({
  // Layout containers.
  // Pure layout containers — never useful empty. Enforced at compile-time
  // via the Gemini validator hook so the LLM can't produce a wireframe-
  // shaped manifest.
  Stack: { can_contain: '*', min_children: 1, max_children: 50 },
  Container: { can_contain: '*', min_children: 1 },
  // Card is dual-mode (marketplace pivot). Legacy: a bordered surface
  // wrapping a body composed of Stack / Grid / Markdown / Table / EmptyState.
  // Tile mode: a self-contained tile rendered inside a `<Grid data={...}>`
  // where image / title / subtitle / price / badge / actions come from
  // props (and `data` defaults), with NO manifest children. So we widen
  // `can_contain` to '*' (a Card may legitimately wrap anything when used
  // as a panel) and drop the min_children floor — the runtime fills tile
  // fields from `data` when the manifest declared no children.
  Card: { can_contain: '*' },
  Tabs: { can_contain: '*', min_children: 1 },
  Accordion: { can_contain: '*', min_children: 1 },
  Modal: { can_contain: '*', min_children: 1 },
  Drawer: { can_contain: '*', min_children: 1 },
  // Data-bound containers — Grid and List render from a `data` binding via
  // a default or supplied renderItem. They're "empty" by construction at
  // manifest-author time; the runtime fills rows. NO min_children here, or
  // custom bindings declaring `compositionRole: 'grid' | 'list'` (e.g.
  // ProductGrid) would falsely fail.
  Grid: { can_contain: '*' },
  // Display.
  Table: { can_contain: 'leaf' },
  // List wraps each child via `renderItem`, so the manifest may compose it
  // with anything ('*'), per the spec for List.
  List: { can_contain: '*' },
  // Queue renders its rows from `data` / `items` and per-row buttons from
  // declarative `actions` props — no manifest-level children. Treated as a
  // list role for long-list-hierarchy obligations.
  Queue: { can_contain: 'leaf' },
  // Logo is a brand-mark leaf — `<img>` / glyph / wordmark, no children.
  Logo: { can_contain: 'leaf' },
  // Leaves: no children.
  Markdown: { can_contain: 'leaf' },
  // MetaBadge is a small inline status pill (count / label / severity / live).
  // Content comes from props; manifest authors do not nest children.
  MetaBadge: { can_contain: 'leaf' },
  EmptyState: { can_contain: 'leaf' },
  Button: { can_contain: 'leaf' },
  TextInput: { can_contain: 'leaf' },
  Select: { can_contain: 'leaf' },
  Alert: { can_contain: 'leaf' },
  Spinner: { can_contain: 'leaf' },
  DetailView: { can_contain: 'leaf' },
  StatCard: { can_contain: 'leaf' },
  StatusBar: { can_contain: 'leaf' },
  Toast: { can_contain: 'leaf' },
  Progress: { can_contain: 'leaf' },
  Skeleton: { can_contain: 'leaf' },
  // Action: ConfirmDialog renders its own buttons internally; manifest authors
  // do not nest children inside it.
  ConfirmDialog: { can_contain: 'leaf' },
  // Action (batch 3).
  // ButtonGroup wraps arbitrary action children — the host composes Buttons
  // (or other action triggers) inside it.
  ButtonGroup: { can_contain: '*' },
  // ActionMenu consumes its menu via the `items` prop, so the manifest
  // never embeds children inside it.
  ActionMenu: { can_contain: 'leaf' },
  // Search renders its own input + clear button internally.
  Search: { can_contain: 'leaf' },
  // Wave 11 / Int-12 — SettingsSearch renders its input + grouped result
  // list from the `items` prop; manifest authors do not embed children.
  SettingsSearch: { can_contain: 'leaf' },
  // Wave 11 / Nav-5 — ScopeSwitcher renders its trigger + popover from the
  // `options` prop; manifest authors do not embed children.
  ScopeSwitcher: { can_contain: 'leaf' },
  // Specialized (batch 3).
  // Form hosts arbitrary input children; the auto-injected submit/cancel
  // buttons are appended internally.
  Form: { can_contain: '*' },
  // Wizard consumes its step list via the `steps` prop — each step's content
  // is a ReactNode carried inline, not a manifest child.
  Wizard: { can_contain: 'leaf' },
  // FilterBar renders its controls from the `filters` prop.
  FilterBar: { can_contain: 'leaf' },
  // KPIRow renders its tiles from the `stats` prop (StatCard reuse).
  KPIRow: { can_contain: 'leaf' },
  // Gallery renders its figures from the `items` prop.
  Gallery: { can_contain: 'leaf' },
  // CommandPalette consumes commands via the `commands` prop.
  CommandPalette: { can_contain: 'leaf' },
  // Wave 11 / Cnt-6 — BlockMenu consumes block kinds via a
  // `BlockKindRegistry` (filtered by `surface`); manifest authors do not
  // embed children.
  BlockMenu: { can_contain: 'leaf' },
  // Stepper renders steps from the `steps` prop.
  Stepper: { can_contain: 'leaf' },
  NumberInput: { can_contain: 'leaf' },
  DateInput: { can_contain: 'leaf' },
  TimeInput: { can_contain: 'leaf' },
  MultiSelect: { can_contain: 'leaf' },
  Toggle: { can_contain: 'leaf' },
  Slider: { can_contain: 'leaf' },
  FileUpload: { can_contain: 'leaf' },
  // Navigation primitives consume `items` (and an optional `brand` for NavBar)
  // from props; no manifest-level children.
  NavBar: { can_contain: 'leaf' },
  Breadcrumb: { can_contain: 'leaf' },
  Pagination: { can_contain: 'leaf' },
  Split: { can_contain: '*', min_children: 2, max_children: 2 },
  Chart: { can_contain: 'leaf' },
  Timeline: { can_contain: 'leaf' },
  Tree: { can_contain: 'leaf' },
  CodeBlock: { can_contain: 'leaf' },
  CodeView: { can_contain: 'leaf' },
  DiffView: { can_contain: 'leaf' },
  Map: { can_contain: 'leaf' },
  RichText: { can_contain: 'leaf' },
  CodeEditor: { can_contain: 'leaf' },
  Sidebar: { can_contain: 'leaf' },
  Kanban: { can_contain: 'leaf' },
  Calendar: { can_contain: 'leaf' },
  ChatThread: { can_contain: 'leaf' },
  Tooltip: { can_contain: '*', min_children: 1, max_children: 1 },
  HoverCard: { can_contain: '*', min_children: 1, max_children: 1 },
  Icon: { can_contain: 'leaf' },
  BulkActionBar: { can_contain: 'leaf' },
  // Wave 10 / S-2 — virtualized list + table primitives. Both render rows
  // from `data` / `items` / `rows` via an internal virtualizer; manifest
  // authors do not embed children. Treated as list / table roles for the
  // long-list-hierarchy policy (which itself nudges toward these
  // components when capability cardinality crosses the virtual threshold).
  VirtualList: { can_contain: 'leaf' },
  VirtualTable: { can_contain: 'leaf' },
});
