// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Component bindings + composition rules for the Phase 4b baseline catalog.
 *
 * `COMPONENT_BINDINGS` is the single source of truth that pairs a CIR
 * componentId with its concrete React factory. The Phase 4b React adapter
 * imports `ALL_COMPONENTS` and hands it to the runtime's render-plan
 * builder; the runtime treats `factory` as opaque (see
 * `@cir/runtime/registry/component-registry`).
 *
 * `COMPOSITION_RULES` mirrors the structure described in
 * `/Users/vid/cir/docs/component-catalog.md` §"Composition rules". The
 * compiler reads these to produce valid manifest layouts; the runtime can
 * validate at render time. Leaf components (Markdown, Spinner, Button,
 * inputs, EmptyState, Alert) declare `can_contain: 'leaf'` — a sentinel
 * that means "do not embed children" and is distinct from `'*'` (anything).
 */

import { MapComponentRegistry, type ComponentBinding } from '@cir/runtime';

import { AccordionBinding } from './components/Accordion.js';
import { ActionMenuBinding } from './components/ActionMenu.js';
import { AlertBinding } from './components/Alert.js';
import { BreadcrumbBinding } from './components/Breadcrumb.js';
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
import { KPIRowBinding } from './components/KPIRow.js';
import { KanbanBinding } from './components/Kanban.js';
import { ListBinding } from './components/List.js';
import { MapBinding } from './components/Map.js';
import { MarkdownBinding } from './components/Markdown.js';
import { ModalBinding } from './components/Modal.js';
import { MultiSelectBinding } from './components/MultiSelect.js';
import { NavBarBinding } from './components/NavBar.js';
import { NumberInputBinding } from './components/NumberInput.js';
import { PaginationBinding } from './components/Pagination.js';
import { ProgressBinding } from './components/Progress.js';
import { RichTextBinding } from './components/RichText.js';
import { SearchBinding } from './components/Search.js';
import { SelectBinding } from './components/Select.js';
import { SidebarBinding } from './components/Sidebar.js';
import { SkeletonBinding } from './components/Skeleton.js';
import { SliderBinding } from './components/Slider.js';
import { SpinnerBinding } from './components/Spinner.js';
import { SplitBinding } from './components/Split.js';
import { StackBinding } from './components/Stack.js';
import { StatCardBinding } from './components/StatCard.js';
import { StepperBinding } from './components/Stepper.js';
import { TableBinding } from './components/Table.js';
import { TabsBinding } from './components/Tabs.js';
import { TextInputBinding } from './components/TextInput.js';
import { TimeInputBinding } from './components/TimeInput.js';
import { TimelineBinding } from './components/Timeline.js';
import { ToastBinding } from './components/Toast.js';
import { ToggleBinding } from './components/Toggle.js';
import { TreeBinding } from './components/Tree.js';
import { WizardBinding } from './components/Wizard.js';

export const COMPONENT_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  Accordion: AccordionBinding,
  ActionMenu: ActionMenuBinding,
  Alert: AlertBinding,
  Breadcrumb: BreadcrumbBinding,
  Button: ButtonBinding,
  ButtonGroup: ButtonGroupBinding,
  Calendar: CalendarBinding,
  Card: CardBinding,
  Chart: ChartBinding,
  ChatThread: ChatThreadBinding,
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
  KPIRow: KPIRowBinding,
  Kanban: KanbanBinding,
  List: ListBinding,
  Map: MapBinding,
  Markdown: MarkdownBinding,
  Modal: ModalBinding,
  MultiSelect: MultiSelectBinding,
  NavBar: NavBarBinding,
  NumberInput: NumberInputBinding,
  Pagination: PaginationBinding,
  Progress: ProgressBinding,
  RichText: RichTextBinding,
  Search: SearchBinding,
  Select: SelectBinding,
  Sidebar: SidebarBinding,
  Skeleton: SkeletonBinding,
  Slider: SliderBinding,
  Spinner: SpinnerBinding,
  Split: SplitBinding,
  Stack: StackBinding,
  StatCard: StatCardBinding,
  Stepper: StepperBinding,
  Table: TableBinding,
  Tabs: TabsBinding,
  TextInput: TextInputBinding,
  TimeInput: TimeInputBinding,
  Timeline: TimelineBinding,
  Toast: ToastBinding,
  Toggle: ToggleBinding,
  Tree: TreeBinding,
  Wizard: WizardBinding,
});

/**
 * Pre-built `ComponentRegistry` containing every Phase 4b component.
 * Most adapters can use this directly; pass to the runtime's render plan
 * builder.
 */
export const ALL_COMPONENTS = new MapComponentRegistry(COMPONENT_BINDINGS);

/**
 * Composition rule for a component. `'*'` means "any component"; an array
 * means "only these"; `'leaf'` means "no children at all".
 */
export interface CompositionRule {
  can_contain: '*' | 'leaf' | readonly string[];
  min_children?: number;
  max_children?: number;
}

export const COMPOSITION_RULES: Readonly<Record<string, CompositionRule>> = Object.freeze({
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
});
