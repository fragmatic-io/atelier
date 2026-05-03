// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Component bindings + composition rules for the Phase 4b baseline catalog.
 *
 * `COMPONENT_BINDINGS` is the single source of truth that pairs a Atelier
 * componentId with its concrete React factory. The Phase 4b React adapter
 * imports `ALL_COMPONENTS` and hands it to the runtime's render-plan
 * builder; the runtime treats `factory` as opaque (see
 * `@atelier/runtime/registry/component-registry`).
 *
 * `COMPOSITION_RULES` mirrors the structure described in
 * `/Users/vid/cir/docs/component-catalog.md` §"Composition rules". The
 * compiler reads these to produce valid manifest layouts; the runtime can
 * validate at render time. Leaf components (Markdown, Spinner, Button,
 * inputs, EmptyState, Alert) declare `can_contain: 'leaf'` — a sentinel
 * that means "do not embed children" and is distinct from `'*'` (anything).
 */

import { MapComponentRegistry, type ComponentBinding } from '@atelier/runtime';

import { AccordionBinding } from './components/Accordion.js';
import { ActionMenuBinding } from './components/ActionMenu.js';
import { AlertBinding } from './components/Alert.js';
import { BlockMenuBinding } from './components/BlockMenu.js';
import { BreadcrumbBinding } from './components/Breadcrumb.js';
import { BulkActionBarBinding } from './components/BulkActionBar.js';
import { ButtonBinding } from './components/Button.js';
import { ButtonGroupBinding } from './components/ButtonGroup.js';
import { CalendarBinding } from './components/Calendar.js';
import { CardBinding } from './components/Card.js';
import { ChartBinding } from './components/Chart.js';
import { ChatThreadBinding } from './components/ChatThread.js';
import { CodeEditorBinding } from './components/CodeEditor.js';
import { CodeViewBinding } from './components/CodeView.js';
import { CommandPaletteBinding } from './components/CommandPalette.js';
import { ConfirmDialogBinding } from './components/ConfirmDialog.js';
import { ContainerBinding } from './components/Container.js';
import { DateInputBinding } from './components/DateInput.js';
import { DetailViewBinding } from './components/DetailView.js';
import { DiffViewBinding } from './components/DiffView.js';
import { DrawerBinding } from './components/Drawer.js';
import { EmptyStateBinding } from './components/EmptyState.js';
import { FileUploadBinding } from './components/FileUpload.js';
import { FilterBarBinding } from './components/FilterBar.js';
import { FormBinding } from './components/Form.js';
import { GalleryBinding } from './components/Gallery.js';
import { GridBinding } from './components/Grid.js';
import { HoverCardBinding } from './components/HoverCard.js';
import { IconBinding } from './components/Icon.js';
import { KPIRowBinding } from './components/KPIRow.js';
import { KanbanBinding } from './components/Kanban.js';
import { ListBinding } from './components/List.js';
import { LogoBinding } from './components/Logo.js';
import { MapBinding } from './components/Map.js';
import { MarkdownBinding } from './components/Markdown.js';
import { MetaBadgeBinding } from './components/MetaBadge.js';
import { ModalBinding } from './components/Modal.js';
import { MultiSelectBinding } from './components/MultiSelect.js';
import { NavBarBinding } from './components/NavBar.js';
import { NumberInputBinding } from './components/NumberInput.js';
import { PaginationBinding } from './components/Pagination.js';
import { ProgressBinding } from './components/Progress.js';
import { QueueBinding } from './components/Queue.js';
import { RichTextBinding } from './components/RichText.js';
import { ScopeSwitcherBinding } from './components/ScopeSwitcher.js';
import { SearchBinding } from './components/Search.js';
import { SelectBinding } from './components/Select.js';
import { SettingsSearchBinding } from './components/SettingsSearch.js';
import { SidebarBinding } from './components/Sidebar.js';
import { SkeletonBinding } from './components/Skeleton.js';
import { SliderBinding } from './components/Slider.js';
import { SpinnerBinding } from './components/Spinner.js';
import { SplitBinding } from './components/Split.js';
import { StackBinding } from './components/Stack.js';
import { StatCardBinding } from './components/StatCard.js';
import { StepperBinding } from './components/Stepper.js';
import { TableBinding } from './components/Table.js';
import { CodeBlockBinding } from './components/CodeBlock.js';
import { StatusBarBinding } from './components/StatusBar.js';
import { VirtualListBinding } from './components/VirtualList.js';
import { VirtualTableBinding } from './components/VirtualTable.js';
import { TabsBinding } from './components/Tabs.js';
import { TextInputBinding } from './components/TextInput.js';
import { TimeInputBinding } from './components/TimeInput.js';
import { TimelineBinding } from './components/Timeline.js';
import { ToastBinding } from './components/Toast.js';
import { ToggleBinding } from './components/Toggle.js';
import { TooltipBinding } from './components/Tooltip.js';
import { TreeBinding } from './components/Tree.js';
import { WizardBinding } from './components/Wizard.js';

export const COMPONENT_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  Accordion: AccordionBinding,
  ActionMenu: ActionMenuBinding,
  Alert: AlertBinding,
  BlockMenu: BlockMenuBinding,
  Breadcrumb: BreadcrumbBinding,
  BulkActionBar: BulkActionBarBinding,
  Button: ButtonBinding,
  ButtonGroup: ButtonGroupBinding,
  Calendar: CalendarBinding,
  Card: CardBinding,
  Chart: ChartBinding,
  ChatThread: ChatThreadBinding,
  CodeBlock: CodeBlockBinding,
  CodeEditor: CodeEditorBinding,
  CodeView: CodeViewBinding,
  CommandPalette: CommandPaletteBinding,
  ConfirmDialog: ConfirmDialogBinding,
  Container: ContainerBinding,
  DateInput: DateInputBinding,
  DetailView: DetailViewBinding,
  DiffView: DiffViewBinding,
  Drawer: DrawerBinding,
  EmptyState: EmptyStateBinding,
  FileUpload: FileUploadBinding,
  FilterBar: FilterBarBinding,
  Form: FormBinding,
  Gallery: GalleryBinding,
  Grid: GridBinding,
  HoverCard: HoverCardBinding,
  Icon: IconBinding,
  KPIRow: KPIRowBinding,
  Kanban: KanbanBinding,
  List: ListBinding,
  Logo: LogoBinding,
  Map: MapBinding,
  Markdown: MarkdownBinding,
  MetaBadge: MetaBadgeBinding,
  Modal: ModalBinding,
  MultiSelect: MultiSelectBinding,
  NavBar: NavBarBinding,
  NumberInput: NumberInputBinding,
  Pagination: PaginationBinding,
  Progress: ProgressBinding,
  Queue: QueueBinding,
  RichText: RichTextBinding,
  ScopeSwitcher: ScopeSwitcherBinding,
  Search: SearchBinding,
  Select: SelectBinding,
  SettingsSearch: SettingsSearchBinding,
  Sidebar: SidebarBinding,
  Skeleton: SkeletonBinding,
  Slider: SliderBinding,
  Spinner: SpinnerBinding,
  Split: SplitBinding,
  Stack: StackBinding,
  StatCard: StatCardBinding,
  StatusBar: StatusBarBinding,
  Stepper: StepperBinding,
  Table: TableBinding,
  Tabs: TabsBinding,
  TextInput: TextInputBinding,
  TimeInput: TimeInputBinding,
  Timeline: TimelineBinding,
  Toast: ToastBinding,
  Toggle: ToggleBinding,
  Tooltip: TooltipBinding,
  Tree: TreeBinding,
  // Wave 10 / S-2 — virtualized variants of List + Table for high-cardinality
  // data. Forced by `composes_hierarchy_for_long_lists` when the bound
  // capability declares `expected_count > 500`. Same surface as the
  // non-virtual primitives plus cursor-driven onFetchMore / onFetchPrev.
  VirtualList: VirtualListBinding,
  VirtualTable: VirtualTableBinding,
  Wizard: WizardBinding,
});

/**
 * Pre-built `ComponentRegistry` containing every Phase 4b component.
 * Most adapters can use this directly; pass to the runtime's render plan
 * builder.
 */
export const ALL_COMPONENTS = new MapComponentRegistry(COMPONENT_BINDINGS);

/**
 * Optional, code-side metadata for a component. Read by the sync script to
 * project into `components/registry.json` (`data_sources`,
 * `actions_supported`, `examples`). The runtime does not consume this — it
 * lives next to the bindings purely so component authors have one file to
 * update when they add a primitive.
 *
 * Be honest about emptiness: a component that has no defensible binding to a
 * shipped capability should leave `dataSources` / `actionsSupported`
 * undefined. Empty (or absent) beats fabrication; the sync script projects
 * `undefined` as `[]`.
 */
export interface ComponentBindingMetadata {
  /**
   * Capability ids this component reads from. Empty (or omitted) for
   * pure-display leaves and layout primitives. Only populate where the
   * component is designed to bind to the named capability.
   */
  dataSources?: readonly string[];
  /**
   * Capability ids this component can dispatch as actions. Empty (or
   * omitted) for pure-display. Only populate where the component is
   * designed to dispatch the named capability.
   */
  actionsSupported?: readonly string[];
  /**
   * Paths to example JSON manifests demonstrating this component. These
   * point at `recipes/*.json` artifacts the compiler can use as few-shot
   * fodder. Paths are repo-rooted (e.g. `/recipes/github-reviewer.json`)
   * so they round-trip through the published JSON without needing to be
   * resolved relative to a specific directory.
   */
  examples?: readonly string[];
}

/**
 * Per-component metadata projected to `components/registry.json` by
 * `scripts/sync-component-registry.ts`. Keyed by the same id as
 * `COMPONENT_BINDINGS`. Entries are intentionally sparse — every component
 * that has no real, defensible capability binding (every leaf input,
 * layout primitive, display-only component) is simply omitted, and the
 * sync script falls through to empty arrays. Comments call out why each
 * group is empty so future authors can extend without guessing.
 */
export const COMPONENT_METADATA: Readonly<Record<string, ComponentBindingMetadata>> = Object.freeze(
  {
    // -------------------------------------------------------------------------
    // Display + layout primitives that surface lists of capability data.
    //
    // The two capabilities shipping today that emit list-shaped output are
    // `github.repo.list` and `dummyjson.product.list` /
    // `dummyjson.product.search`. Components that idiomatically render a
    // list/grid/table of those records carry the binding so the compiler
    // has a real, defensible link to follow. Action dispatch goes via the
    // recipe `actions` array (not the component contract); we leave
    // `actionsSupported` empty because no shipped component "owns" a
    // specific action — `Button` / `ButtonGroup` / `ActionMenu` are
    // generic dispatchers.
    // -------------------------------------------------------------------------
    List: {
      dataSources: ['github.repo.list', 'dummyjson.product.list', 'dummyjson.product.search'],
      examples: ['/recipes/github-reviewer.json', '/recipes/dummyjson-shopper.json'],
    },
    Table: {
      dataSources: ['github.repo.list', 'dummyjson.product.list'],
    },
    Grid: {
      dataSources: ['dummyjson.product.list'],
      examples: ['/recipes/dummyjson-shopper.json'],
    },
    Search: {
      // Search only binds to capabilities that accept a free-text query.
      // `dummyjson.product.search` is the one shipped today.
      dataSources: ['dummyjson.product.search'],
      examples: ['/recipes/dummyjson-shopper.json'],
    },
    // KPIRow renders aggregate stats from a list-shaped capability; binding
    // to the catalog list is the only honest link today.
    KPIRow: {
      dataSources: ['dummyjson.product.list'],
    },
    // -------------------------------------------------------------------------
    // Layout containers — pure structural composition. They carry NO inherent
    // capability binding; their children pick up data/actions. Examples are
    // populated where the recipe demonstrably uses them as the outer shell.
    // -------------------------------------------------------------------------
    Stack: {
      // Pure layout — no inherent data binding.
      examples: ['/recipes/github-reviewer.json', '/recipes/dummyjson-shopper.json'],
    },
    Container: {
      // Pure layout — no inherent data binding.
      examples: ['/recipes/github-reviewer.json', '/recipes/dummyjson-shopper.json'],
    },
    NavBar: {
      // Navigation primitive — `links` come from props, not a capability.
      examples: ['/recipes/github-reviewer.json', '/recipes/dummyjson-shopper.json'],
    },
    // Logo is a brand-mark leaf; assets / wordmark are authored at compile
    // time via brand kit, not bound to a capability.
    Logo: {
      examples: ['/recipes/github-reviewer.json', '/recipes/dummyjson-shopper.json'],
    },
    // Queue subsumes the inbox/task/issue/review list-of-actionable-items
    // pattern. It binds to any list-shaped capability the host publishes;
    // the demos wire it to thread.list, task.list, issue.list, etc. We
    // keep the data sources empty (honest — no shipped capability is
    // canonically "the" Queue source) but examples cite the demos.
    Queue: {
      examples: [
        '/recipes/aurora-decisions.json',
        '/recipes/github-reviewer.json',
        '/recipes/dummyjson-shopper.json',
      ],
    },
    EmptyState: {
      // Display leaf — content is authored at compile time.
      examples: ['/recipes/github-reviewer.json', '/recipes/dummyjson-shopper.json'],
    },
    // Every other component (Form, Wizard, ConfirmDialog, Button, ActionMenu,
    // every input, every display leaf, every layout container not listed
    // above) deliberately has no metadata: the sync script will project
    // empty arrays for `data_sources`, `actions_supported`, and `examples`.
    // That is the honest answer — we don't fabricate bindings.
  },
);

/**
 * Composition rule for a component. `'*'` means "any component"; an array
 * means "only these"; `'leaf'` means "no children at all".
 */
// `CompositionRule` and `COMPOSITION_RULES` live in `composition-rules.ts`
// (server-safe; no React imports). Re-exported here for backwards compat
// with consumers that import from `@atelier/components/registry`.
export { COMPOSITION_RULES, type CompositionRule } from './composition-rules.js';

// (Local definition below intentionally kept dead so this file's diff stays
// minimal during Phase 1.5; future cleanup can drop it. Exported under an
// underscore-prefixed name so `noUnusedLocals` doesn't fire while the body
// still serves as the audit reference for `composition-rules.ts`.)

export const _LEGACY_COMPOSITION_RULES_BODY: Readonly<
  Record<
    string,
    { can_contain: '*' | 'leaf' | readonly string[]; min_children?: number; max_children?: number }
  >
> = Object.freeze({
  // Layout containers.
  Stack: { can_contain: '*', min_children: 1, max_children: 50 },
  Container: { can_contain: '*' },
  Grid: { can_contain: '*' },
  Card: {
    can_contain: ['Stack', 'Grid', 'Markdown', 'Table', 'EmptyState'] as const,
  },
  // Tabs / Accordion are layout containers: their child slots are arbitrary
  // ReactNodes carried in props (`tabs[].content`, `items[].content`), so
  // from a manifest perspective they accept any component just like Stack.
  Tabs: { can_contain: '*' },
  Accordion: { can_contain: '*' },
  // Modal / Drawer host arbitrary content the same way Stack does.
  Modal: { can_contain: '*' },
  Drawer: { can_contain: '*' },
  // Display.
  Table: { can_contain: 'leaf' },
  // List wraps each child via `renderItem`, so the manifest may compose it
  // with anything ('*'), per the spec for List.
  List: { can_contain: '*' },
  // Leaves: no children.
  Markdown: { can_contain: 'leaf' },
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
  // Wave 11 / Int-12 — SettingsSearch renders inline; items come from props.
  SettingsSearch: { can_contain: 'leaf' },
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
  // Wave 11 / Cnt-6 — BlockMenu consumes kinds via a BlockKindRegistry.
  BlockMenu: { can_contain: 'leaf' },
  // Stepper renders steps from the `steps` prop.
  Stepper: { can_contain: 'leaf' },
  // Phase 5c batch 2 — Input + Navigation primitives. Every input is a leaf
  // (it owns its own internal markup; no slot for arbitrary children).
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
  // Phase 5c batch 3 — completes the 50-component baseline catalog.
  // Split is a layout container with two arbitrary children (one per pane).
  Split: { can_contain: '*', min_children: 2, max_children: 2 },
  // Display-only leaves: Chart / Timeline / Tree / CodeView / DiffView / Map
  // each consume their data from props (`data`, `entries`, `nodes`, `code`,
  // `hunks`, `markers`) — manifest authors do not embed children.
  Chart: { can_contain: 'leaf' },
  Timeline: { can_contain: 'leaf' },
  Tree: { can_contain: 'leaf' },
  CodeBlock: { can_contain: 'leaf' },
  CodeView: { can_contain: 'leaf' },
  DiffView: { can_contain: 'leaf' },
  Map: { can_contain: 'leaf' },
  // Phase 5c batch 4 — Input + Navigation + Specialized leaves. RichText /
  // CodeEditor own their own contenteditable / textarea markup; Sidebar
  // consumes its tree from `items`; Kanban / Calendar / ChatThread render
  // their data from props with no manifest-level child slots.
  RichText: { can_contain: 'leaf' },
  CodeEditor: { can_contain: 'leaf' },
  Sidebar: { can_contain: 'leaf' },
  Kanban: { can_contain: 'leaf' },
  Calendar: { can_contain: 'leaf' },
  ChatThread: { can_contain: 'leaf' },
  // Wave 7a / track Int-2 — Tooltip wraps a single trigger element (any
  // component) and renders its bubble via portal. Manifest-side this is a
  // wildcard container with exactly one child.
  Tooltip: { can_contain: '*', min_children: 1, max_children: 1 },
  // Wave 7b / track Int-13 — HoverCard wraps a single trigger element
  // (any component) and renders a rich preview surface via portal. Like
  // Tooltip, manifest-side this is a wildcard container with exactly
  // one child; the card body is supplied via the `content` prop (or a
  // thunk for lazy resolution), not as a manifest child.
  HoverCard: { can_contain: '*', min_children: 1, max_children: 1 },
  // Wave 7b / track Vis-3 — Icon is a pure leaf. The SVG markup is sourced
  // from the host's `IconResolver`; no manifest-level children.
  Icon: { can_contain: 'leaf' },
  // Wave 7b / track Int-9 — BulkActionBar is a self-contained floating
  // surface. The bar's count + buttons + close are rendered from the
  // `selectionCount` / `actions` props, so the manifest does not embed
  // children inside it.
  BulkActionBar: { can_contain: 'leaf' },
});
