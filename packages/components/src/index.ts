// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/components` — Phase 4b baseline React components for CIR.
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

// -----------------------------------------------------------------------------
// Display
// -----------------------------------------------------------------------------
export { Markdown, MarkdownBinding } from './components/Markdown.js';
export type { MarkdownProps } from './components/Markdown.js';

export { Table, TableBinding } from './components/Table.js';
export type { TableProps, TableColumn } from './components/Table.js';

export { EmptyState, EmptyStateBinding } from './components/EmptyState.js';
export type { EmptyStateProps } from './components/EmptyState.js';

export { List, ListBinding } from './components/List.js';
export type { ListProps } from './components/List.js';

export { DetailView, DetailViewBinding } from './components/DetailView.js';
export type { DetailViewProps, DetailField } from './components/DetailView.js';

export { StatCard, StatCardBinding } from './components/StatCard.js';
export type { StatCardProps, StatCardDelta, StatTrend } from './components/StatCard.js';

export { Chart, ChartBinding } from './components/Chart.js';
export type { ChartProps, ChartDatum } from './components/Chart.js';

export { Timeline, TimelineBinding } from './components/Timeline.js';
export type { TimelineProps, TimelineEntry, TimelineStatus } from './components/Timeline.js';

export { Tree, TreeBinding } from './components/Tree.js';
export type { TreeProps, TreeNode } from './components/Tree.js';

export { CodeView, CodeViewBinding } from './components/CodeView.js';
export type { CodeViewProps } from './components/CodeView.js';

export { DiffView, DiffViewBinding } from './components/DiffView.js';
export type { DiffViewProps, DiffHunk, DiffKind } from './components/DiffView.js';

export { Map, MapBinding } from './components/Map.js';
export type { MapProps, MapMarker } from './components/Map.js';

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------
export { Button, ButtonBinding } from './components/Button.js';
export type { ButtonProps, ButtonVariant } from './components/Button.js';

export { TextInput, TextInputBinding } from './components/TextInput.js';
export type { TextInputProps } from './components/TextInput.js';

export { Select, SelectBinding } from './components/Select.js';
export type { SelectProps, SelectOption } from './components/Select.js';

export { Search, SearchBinding } from './components/Search.js';
export type { SearchProps } from './components/Search.js';

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

export { RichText, RichTextBinding, sanitizeRichTextHtml } from './components/RichText.js';
export type { RichTextProps, RichTextToolbarItem } from './components/RichText.js';

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

export { Pagination, PaginationBinding } from './components/Pagination.js';
export type { PaginationProps } from './components/Pagination.js';

export { Sidebar, SidebarBinding } from './components/Sidebar.js';
export type {
  SidebarProps,
  SidebarItem,
  SidebarChildItem,
  SidebarSide,
} from './components/Sidebar.js';

// -----------------------------------------------------------------------------
// Feedback
// -----------------------------------------------------------------------------
export { Alert, AlertBinding } from './components/Alert.js';
export type { AlertProps, AlertSeverity } from './components/Alert.js';

export { Spinner, SpinnerBinding } from './components/Spinner.js';
export type { SpinnerProps } from './components/Spinner.js';

export { Toast, ToastBinding } from './components/Toast.js';
export type { ToastProps } from './components/Toast.js';

export { Progress, ProgressBinding } from './components/Progress.js';
export type { ProgressProps } from './components/Progress.js';

export { Skeleton, SkeletonBinding } from './components/Skeleton.js';
export type { SkeletonProps, SkeletonRadius } from './components/Skeleton.js';

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
