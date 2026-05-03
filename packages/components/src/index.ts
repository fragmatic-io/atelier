// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/components` — Phase 4b baseline React components for Atelier.
 *
 * Public surface:
 *  - 43 React components covering Layout, Display, Input, Navigation,
 *    Feedback, Action, and Specialized primitives.
 *  - Their corresponding `ComponentBinding`s.
 *  - `ALL_COMPONENTS` (pre-built registry), `COMPONENT_BINDINGS`,
 *    `COMPOSITION_RULES`, `TEXT_RENDERERS`.
 *
 * What this package is NOT:
 *  - Styled. There is zero CSS and no styling library. A Phase 4c demo
 *    package will layer Tailwind/CSS on top via `data-cir-component=...`
 *    selectors and `data-variant=...` data attributes.
 *  - A markdown renderer. `Markdown` is a `<pre>` stub in 4b; Phase 5 swaps
 *    in a sanitized renderer once the security model is decided.
 */

// -----------------------------------------------------------------------------
// Density (personalisation token shared across layout components)
// -----------------------------------------------------------------------------
export {
  DEFAULT_DENSITY,
  DENSITY_CSS_VALUES,
  DENSITY_CSS_VAR_NAMES,
  DENSITY_GAP_MULTIPLIER,
  DENSITY_PADDING_PX,
  DENSITY_ROW_PADDING_PX,
  densityScaleGapPx,
  type Density,
} from './components/density.js';

// Wave 11 / Vis-6 — per-route density resolution (intent → effective density).
export {
  compileRouteGlob,
  matchRouteGlob,
  resolveDensity,
  type DensityOverride,
} from './density-resolver.js';

// Wave 11 / Vis-6 — Tailwind variant table for compact / comfortable / spacious.
export { densityClass, DENSITY_AWARE_COMPONENTS } from './components/_variants.js';

// -----------------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------------
export { Stack, StackBinding, STACK_GAP_PX } from './components/Stack.js';
export type { StackProps, StackDirection, StackGap, StackAlign } from './components/Stack.js';

export { Card, CardBinding } from './components/Card.js';
export type { CardProps } from './components/Card.js';

export { Container, ContainerBinding, CONTAINER_MAX_WIDTH } from './components/Container.js';
export type {
  ContainerProps,
  ContainerMaxWidth,
  ContainerPadding,
} from './components/Container.js';

export { Grid, GridBinding } from './components/Grid.js';
export type { GridProps, GridColumns } from './components/Grid.js';

export { Tabs, TabsBinding } from './components/Tabs.js';
export type { TabsProps, TabItem } from './components/Tabs.js';

export { Accordion, AccordionBinding } from './components/Accordion.js';
export type { AccordionProps, AccordionItem } from './components/Accordion.js';

export { Modal, ModalBinding } from './components/Modal.js';
export type { ModalProps, ModalSize } from './components/Modal.js';

export { Drawer, DrawerBinding } from './components/Drawer.js';
export type { DrawerProps, DrawerSide } from './components/Drawer.js';

export { Split, SplitBinding } from './components/Split.js';
export type { SplitProps } from './components/Split.js';

// Wave 11 / Nav-1 — `<MultiPane>` is the 3+-pane generalisation of `<Split>`.
// Reference workflows: Slack (sidebar / main / thread), Discord (servers /
// channels / main / members), Linear (filters / list / detail). Sizes +
// collapse state persist via the same `localStorage`-backed JSON shape
// `<Sidebar>` (Nav-2) uses; the host-facing `usePersistedState` hook in
// `@atelier/react` is the richer (session/local/vault) surface for the
// same concern.
export {
  MultiPane,
  MultiPaneBinding,
  multiPaneTextRender,
} from './components/MultiPane.js';
export type {
  MultiPaneProps,
  MultiPaneDirection,
  PaneSpec,
} from './components/MultiPane.js';

// -----------------------------------------------------------------------------
// Display
// -----------------------------------------------------------------------------
// Wave 11 / Cnt-5 — Linear-quality Markdown. `markdownVariantClass` is the
// spacing-axis class table (`'default' | 'tight' | 'loose'`); `MarkdownRenderers`
// re-exports react-markdown's `Components` map shape so hosts can type their
// per-element renderer overrides.
export { Markdown, MarkdownBinding, markdownVariantClass } from './components/Markdown.js';
export type { MarkdownProps, MarkdownRenderers, MarkdownVariant } from './components/Markdown.js';

export { Table, TableBinding } from './components/Table.js';
export type { TableProps, TableColumn, TableRowSpec } from './components/Table.js';

export { EmptyState, EmptyStateBinding } from './components/EmptyState.js';
export type { EmptyStateProps } from './components/EmptyState.js';

export { List, ListBinding } from './components/List.js';
export type { ListProps } from './components/List.js';

// Wave 10 / S-2 — virtualized variants of List + Table for high-cardinality
// data. Mirror the surface of the non-virtual primitives plus cursor-driven
// onFetchMore / onFetchPrev callbacks; backed by `@tanstack/react-virtual`.
export {
  VirtualList,
  VirtualListBinding,
  virtualListTextRender,
  VIRTUAL_LIST_DEFAULT_ESTIMATE,
  VIRTUAL_LIST_DEFAULT_OVERSCAN,
} from './components/VirtualList.js';
export type { VirtualListProps, VirtualListVariant } from './components/VirtualList.js';

export {
  VirtualTable,
  VirtualTableBinding,
  virtualTableTextRender,
  VIRTUAL_TABLE_DEFAULT_ESTIMATE,
  VIRTUAL_TABLE_DEFAULT_OVERSCAN,
} from './components/VirtualTable.js';
export type { VirtualTableProps, VirtualTableVariant } from './components/VirtualTable.js';

export { Queue, QueueBinding, queueTextRender } from './components/Queue.js';
export type { QueueProps, QueueAction, QueueVariant } from './components/Queue.js';

export { Logo, LogoBinding, logoTextRender } from './components/Logo.js';
export type { LogoProps, LogoSize } from './components/Logo.js';

export { MetaBadge, MetaBadgeBinding, metaBadgeTextRender } from './components/MetaBadge.js';
export type { MetaBadgeProps, MetaBadgeVariant } from './components/MetaBadge.js';

export { DetailView, DetailViewBinding } from './components/DetailView.js';
export type { DetailViewProps, DetailField } from './components/DetailView.js';

export { StatCard, StatCardBinding } from './components/StatCard.js';
export type { StatCardProps, StatCardDelta, StatTrend } from './components/StatCard.js';

export { StatusBar, StatusBarBinding, statusBarTextRender } from './components/StatusBar.js';
export type { StatusBarProps, StatusBarStatus, StatusBarVariant } from './components/StatusBar.js';

export { Chart, ChartBinding } from './components/Chart.js';
export type { ChartProps, ChartDatum } from './components/Chart.js';

export { Timeline, TimelineBinding } from './components/Timeline.js';
export type { TimelineProps, TimelineEntry, TimelineStatus } from './components/Timeline.js';

export { Tree, TreeBinding } from './components/Tree.js';
export type { TreeProps, TreeNode } from './components/Tree.js';

export {
  CodeView,
  CodeViewBinding,
  FOLD_THRESHOLD,
  FOLD_COLLAPSED_LINES,
} from './components/CodeView.js';
export type { CodeViewProps } from './components/CodeView.js';

export { CodeBlock, CodeBlockBinding, codeBlockTextRender } from './components/CodeBlock.js';
export type { CodeBlockProps, CodeBlockVariant } from './components/CodeBlock.js';

// Wave 11 / Cnt-1 — Shiki bridge surfaces (lazy, optional peer dep). The
// `highlight` / `clearShikiCache` exports are mostly for tests + advanced
// hosts that want to pre-warm the cache; everyday usage flows through
// `<CodeView language="…">`.
export { highlight, clearShikiCache, DEFAULT_SHIKI_THEME } from './code/shiki.js';
export type { ShikiThemePair, ShikiHighlightResult } from './code/shiki.js';
export { useHighlightedCode } from './code/use-highlighted.js';
export type { HighlightedCodeState } from './code/use-highlighted.js';

export { DiffView, DiffViewBinding } from './components/DiffView.js';
export type {
  DiffViewProps,
  DiffHunk,
  DiffKind,
  DiffKindInput,
  DiffLine,
  LegacyDiffRow,
} from './components/DiffView.js';

// Wave 11 / Cnt-9 — Activity feed with diff visualization. Linear-style
// typed-event timeline (`status_changed`, `label_added`, …) with collapse-
// by-default `<DiffView>` + Stripe-style structured payload disclosure.
// Adjacent same-`group` events collapse into a stacked row. `onLoadMore` is
// debounced via in-flight ref so threshold crossings fire once.
export {
  ActivityFeed,
  ActivityFeedBinding,
  activityFeedTextRender,
  groupAdjacentEvents,
  LOAD_MORE_THRESHOLD_PX,
} from './components/ActivityFeed.js';
export type {
  ActivityFeedProps,
  ActivityEvent,
  ActivityActor,
  ActivityDiff,
} from './components/ActivityFeed.js';

export { Map, MapBinding } from './components/Map.js';
export type { MapProps, MapMarker } from './components/Map.js';

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------
export { Button, ButtonBinding } from './components/Button.js';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button.js';

export { TextInput, TextInputBinding } from './components/TextInput.js';
export type { TextInputProps } from './components/TextInput.js';

export { Select, SelectBinding } from './components/Select.js';
export type { SelectProps, SelectOption } from './components/Select.js';

export { Search, SearchBinding } from './components/Search.js';
export type { SearchProps, SearchVariant } from './components/Search.js';

export { NumberInput, NumberInputBinding } from './components/NumberInput.js';
export type { NumberInputProps } from './components/NumberInput.js';

export { DateInput, DateInputBinding } from './components/DateInput.js';
export type { DateInputProps } from './components/DateInput.js';

export { TimeInput, TimeInputBinding } from './components/TimeInput.js';
export type { TimeInputProps } from './components/TimeInput.js';

export { MultiSelect, MultiSelectBinding } from './components/MultiSelect.js';
export type { MultiSelectProps, MultiSelectOption } from './components/MultiSelect.js';

export { Toggle, ToggleBinding } from './components/Toggle.js';
export type { ToggleProps } from './components/Toggle.js';

export { Slider, SliderBinding } from './components/Slider.js';
export type { SliderProps } from './components/Slider.js';

export { FileUpload, FileUploadBinding } from './components/FileUpload.js';
export type { FileUploadProps } from './components/FileUpload.js';

export {
  RichText,
  RichTextBinding,
  detectFirstUrlForPaste,
  sanitizeRichTextHtml,
} from './components/RichText.js';
export type {
  RichTextProps,
  RichTextSmartPaste,
  RichTextToolbarItem,
} from './components/RichText.js';

export { CodeEditor, CodeEditorBinding } from './components/CodeEditor.js';
export type { CodeEditorProps } from './components/CodeEditor.js';

export { Calendar, CalendarBinding } from './components/Calendar.js';
export type { CalendarProps, CalendarHighlight, CalendarTone } from './components/Calendar.js';

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------
export { NavBar, NavBarBinding } from './components/NavBar.js';
export type { NavBarProps, NavItem } from './components/NavBar.js';

export { Breadcrumb, BreadcrumbBinding } from './components/Breadcrumb.js';
export type { BreadcrumbProps, BreadcrumbItem } from './components/Breadcrumb.js';

// Wave 11 / Nav-4 — drilldown trail (URL-shareable). Pair the data shape with
// `<Breadcrumb trail={…} onNavigate={…}>` and `useTrail()` from `@atelier/react`.
export { serializeTrail, parseTrail, type TrailSegment } from './breadcrumb/trail.js';

export { Pagination, PaginationBinding } from './components/Pagination.js';
export type { PaginationProps } from './components/Pagination.js';

export { Sidebar, SidebarBinding } from './components/Sidebar.js';
export type {
  SidebarProps,
  SidebarItem,
  SidebarChildItem,
  SidebarSide,
} from './components/Sidebar.js';

// Wave 11 / Vis-10 — notification badge data model. Drives grouped
// per-domain unread badges via `<Sidebar aggregator={…}>` + per-item
// `badgeScope`. Brand kits opt into the matching token group via
// `BrandTokensSchema.notification`.
export { NotificationAggregator } from './notification/aggregator.js';
export type {
  NotificationCount,
  NotificationAggregatorListener,
} from './notification/aggregator.js';

// -----------------------------------------------------------------------------
// Feedback
// -----------------------------------------------------------------------------
export { Alert, AlertBinding } from './components/Alert.js';
export type { AlertProps, AlertSeverity } from './components/Alert.js';

export { Spinner, SpinnerBinding } from './components/Spinner.js';
export type { SpinnerProps } from './components/Spinner.js';

export { Toast, ToastBinding } from './components/Toast.js';
export type { ToastProps } from './components/Toast.js';

export { Tooltip, TooltipBinding, computeTooltipPosition } from './components/Tooltip.js';
export type { TooltipProps, TooltipSide } from './components/Tooltip.js';

export {
  HoverCard,
  HoverCardBinding,
  hoverCardTextRender,
  computeHoverCardPosition,
} from './components/HoverCard.js';
export type { HoverCardProps, HoverCardSide } from './components/HoverCard.js';

// Wave 11 / Cnt-3 — Mention / @user / #issue / autolink resolution. Pluggable
// per-prefix resolver protocol + inline rendering primitive `<Mention>` and
// the convenience host-level wrapper `<MentionAware>` that scans raw text and
// renders each match wrapped (when the resolver supplies a preview) in a
// `<HoverCard>`. Cnt-5 (markdown at Linear quality) composes this from the
// markdown renderer side.
export { Mention, MentionBinding } from './components/Mention.js';
export type { MentionProps } from './components/Mention.js';

export { MentionAware } from './components/MentionAware.js';
export type { MentionAwareProps } from './components/MentionAware.js';

export { parseMentions } from './mentions/parser.js';
export { combineMentionResolvers } from './mentions/resolver.js';
export type { MentionDisplay, MentionMatch, MentionResolver } from './mentions/resolver.js';

// Wave 11 / Cnt-4 — Embed system. Pluggable per-provider URL resolver
// protocol (`EmbedResolver`), an ordered registry surface (`EmbedRegistry`
// / `InMemoryEmbedRegistry`), built-in resolvers for YouTube / Loom /
// Figma + a generic oEmbed fallback (`oembedResolver` accepts a
// host-supplied fetch — no hard dep on `globalThis.fetch`), and the
// `<Embed>` rendering primitive that owns the async resolution + falls
// back to a plain link on failure. Embed is NOT a manifest-bound
// component (host-level composition); Cnt-5 (markdown) and Int-15 (smart
// paste) consume it directly.
export { Embed } from './components/Embed.js';
export type { EmbedProps } from './components/Embed.js';

export { InMemoryEmbedRegistry } from './embeds/registry.js';
export type { EmbedRegistry } from './embeds/registry.js';
export type { EmbedDisplay, EmbedMatch, EmbedResolver } from './embeds/resolver.js';

export {
  extractFigmaKey,
  extractLoomId,
  extractYouTubeId,
  figmaResolver,
  loomResolver,
  mapOEmbedToDisplay,
  oembedResolver,
  youtubeResolver,
} from './embeds/builtin.js';
export type { OEmbedFetch, OEmbedResolverOptions, OEmbedResponse } from './embeds/builtin.js';

export { Progress, ProgressBinding } from './components/Progress.js';
export type { ProgressProps } from './components/Progress.js';

export { Skeleton, SkeletonBinding } from './components/Skeleton.js';
export type { SkeletonProps, SkeletonRadius, SkeletonShape } from './components/Skeleton.js';

// -----------------------------------------------------------------------------
// Action
// -----------------------------------------------------------------------------
export { ConfirmDialog, ConfirmDialogBinding } from './components/ConfirmDialog.js';
export type { ConfirmDialogProps } from './components/ConfirmDialog.js';

export { ButtonGroup, ButtonGroupBinding } from './components/ButtonGroup.js';
export type { ButtonGroupProps } from './components/ButtonGroup.js';

export { ActionMenu, ActionMenuBinding } from './components/ActionMenu.js';
export type {
  ActionMenuProps,
  ActionMenuItem,
  ActionMenuPlacement,
} from './components/ActionMenu.js';

export {
  BulkActionBar,
  BulkActionBarBinding,
  bulkActionBarTextRender,
} from './components/BulkActionBar.js';
export type { BulkActionBarProps, BulkAction } from './components/BulkActionBar.js';

// -----------------------------------------------------------------------------
// Specialized
// -----------------------------------------------------------------------------
export { Form, FormBinding } from './components/Form.js';
export type { FormProps } from './components/Form.js';

export { Wizard, WizardBinding } from './components/Wizard.js';
export type { WizardProps, WizardStep } from './components/Wizard.js';

export { FilterBar, FilterBarBinding } from './components/FilterBar.js';
export type {
  FilterBarProps,
  FilterDefinition,
  FilterOption,
  FilterType,
} from './components/FilterBar.js';

export { KPIRow, KPIRowBinding } from './components/KPIRow.js';
export type { KPIRowProps, KPIStat } from './components/KPIRow.js';

export { Gallery, GalleryBinding } from './components/Gallery.js';
export type { GalleryProps, GalleryItem } from './components/Gallery.js';

export { CommandPalette, CommandPaletteBinding } from './components/CommandPalette.js';
export type { CommandPaletteProps, CommandPaletteCommand } from './components/CommandPalette.js';

// Wave 11 / Cnt-6 — slash-command menu for block creation. Notion's `/`
// menu — an inline command palette scoped to "what kind of block do I want
// here". Pairs with the per-surface `BlockKindRegistry` so a doc surface and
// a chat surface get different menus. Gates Cnt-7 (block editor) + AI-2
// (slash-AI shortcuts).
export { BlockMenu, BlockMenuBinding, blockMenuTextRender } from './components/BlockMenu.js';
export type { BlockMenuProps, BlockMenuTrigger } from './components/BlockMenu.js';
export { ALL_SURFACES, InMemoryBlockKindRegistry } from './blocks/registry.js';
export type {
  BlockInsertContext,
  BlockKind,
  BlockKindRegistry,
  BlockKindRegistryListener,
} from './blocks/registry.js';

// Wave 11 / Cnt-7 — block-based document editing. `<BlockEditor>` composes
// the 8 baseline block types (paragraph / heading / callout / toggle / code
// / embed / quote / divider) and weaves slash-menu insertion (Cnt-6) +
// keyboard navigation + HTML5 drag-reorder. Unblocks AI-1 ("Ask AI" on
// selection) which depends on a structured editor surface.
export {
  BlockEditor,
  BlockEditorBinding,
  blockEditorTextRender,
} from './components/BlockEditor.js';
export type {
  BlockEditorProps,
  BlockEditorVariant,
  Block,
  BlockType,
} from './components/BlockEditor.js';

// Wave 11 / Int-12 — settings-scoped fuzzy search panel (Stripe / Slack /
// Notion ship one at the top of `/settings`). Self-registers a
// `settings.search` action with the `<KeyboardProvider>` registry when one
// is in scope so a `'/'` hotkey focuses the input.
export {
  SettingsSearch,
  SettingsSearchBinding,
  settingsSearchTextRender,
} from './components/SettingsSearch.js';
export type { SettingsSearchProps, SettingsItem } from './components/SettingsSearch.js';

// Wave 11 / Nav-5 — chrome scope switcher (Vercel / Supabase / Linear ship
// a top-left workspace / team / project switcher). The persisted "active
// scope" id rides on `IntentProfile.scope_active`; the runtime threads it
// back as a default for any component that opts in via its manifest
// contract. Self-registers a `scope.switcher` action with the
// `<KeyboardProvider>` registry when one is in scope so a `'cmd+shift+o'`
// hotkey opens the popover from anywhere.
export {
  ScopeSwitcher,
  ScopeSwitcherBinding,
  scopeSwitcherTextRender,
} from './components/ScopeSwitcher.js';
export type {
  ScopeSwitcherProps,
  ScopeSwitcherVariant,
  ScopeOption,
} from './components/ScopeSwitcher.js';

// Wave 11 / Int-3 — keyboard registry adapter. `KeyboardContext`,
// `<KeyboardProvider>`, and the `useKeyboard*` hooks live here (alongside
// `<CommandPalette>` and the `IconResolver` adapter) so the baseline
// component library doesn't need a runtime dependency on `@atelier/react`.
export {
  KeyboardContext,
  KeyboardProvider,
  useKeyboard,
  useKeyboardAction,
  useKeyboardActions,
  useKeyboardRegistry,
  useKeyboardServicesFromContext,
  type KeyboardProviderProps,
} from './keyboard/index.js';

export { Stepper, StepperBinding } from './components/Stepper.js';
export type {
  StepperProps,
  StepperStep,
  StepperStatus,
  StepperOrientation,
} from './components/Stepper.js';

export { Kanban, KanbanBinding } from './components/Kanban.js';
export type { KanbanProps, KanbanColumn, KanbanCard } from './components/Kanban.js';

export { ChatThread, ChatThreadBinding } from './components/ChatThread.js';
export type { ChatThreadProps, ChatMessage, ChatRole } from './components/ChatThread.js';

// -----------------------------------------------------------------------------
// Icons (Wave 7b / Vis-3) — `<Icon>` plus the host-pluggable resolver
// protocol. Atelier ships zero icon packs; hosts implement `IconResolver` and
// wire it via `<IconResolverProvider>`.
// -----------------------------------------------------------------------------
export {
  Icon,
  IconBinding,
  iconTextRender,
  ICON_DEFAULT_SIZE,
  ICON_DEFAULT_STROKE_WIDTH,
} from './components/Icon.js';
export type { IconProps } from './components/Icon.js';

export { IconResolverContext, IconResolverProvider, useIconResolver } from './icons/context.js';
export type { IconResolverProviderProps } from './icons/context.js';

export { IconBrandContext, IconBrandProvider, useIconBrand } from './icons/brand-context.js';
export type { IconBrandConfig, IconBrandProviderProps } from './icons/brand-context.js';

export { LiteralIconResolver, MapIconResolver, NoopIconResolver } from './icons/resolver.js';
export type { IconResolver } from './icons/resolver.js';

// Wave 11 / Vis-3: concrete `LucideIconResolver` adapter. Hosts that ship
// the lucide pack import this directly; other packs implement
// `IconResolver` themselves.
export {
  LucideIconResolver,
  LUCIDE_DEFAULT_ROSTER,
  LUCIDE_SET_ID,
  lucideIconNodeToSvg,
} from './icons/lucide-resolver.js';
export type { LucideIconResolverOptions, LucideIconNode } from './icons/lucide-resolver.js';

// Shared `IconRef` shape — the discriminated `string | { set, name }`
// shape every component's `icon` prop accepts.
export { DEFAULT_ICON_SET, normalizeIconRef } from './icons/icon-ref.js';
export type { IconRef } from './icons/icon-ref.js';

export type { IconSize } from './components/_variants.js';
export { iconSizePx } from './components/_variants.js';

// -----------------------------------------------------------------------------
// Registry, composition rules, text renderers
// -----------------------------------------------------------------------------
export {
  ALL_COMPONENTS,
  COMPONENT_BINDINGS,
  COMPONENT_METADATA,
  COMPOSITION_RULES,
} from './registry.js';
export type { CompositionRule, ComponentBindingMetadata } from './registry.js';
export { TEXT_RENDERERS, type TextRenderer } from './text-render.js';
