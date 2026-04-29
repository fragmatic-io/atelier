// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/components` — Phase 4b baseline React components for CIR.
 *
 * Public surface:
 *  - 23 React components covering Layout, Display, Input, Feedback, Action.
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

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------
export { Button, ButtonBinding } from './components/Button.js';
export type { ButtonProps, ButtonVariant } from './components/Button.js';

export { TextInput, TextInputBinding } from './components/TextInput.js';
export type { TextInputProps } from './components/TextInput.js';

export { Select, SelectBinding } from './components/Select.js';
export type { SelectProps, SelectOption } from './components/Select.js';

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

// -----------------------------------------------------------------------------
// Registry, composition rules, text renderers
// -----------------------------------------------------------------------------
export { ALL_COMPONENTS, COMPONENT_BINDINGS, COMPOSITION_RULES } from './registry.js';
export type { CompositionRule } from './registry.js';
export { TEXT_RENDERERS, type TextRenderer } from './text-render.js';
