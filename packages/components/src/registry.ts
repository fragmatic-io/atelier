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
import { AlertBinding } from './components/Alert.js';
import { ButtonBinding } from './components/Button.js';
import { CardBinding } from './components/Card.js';
import { ConfirmDialogBinding } from './components/ConfirmDialog.js';
import { ContainerBinding } from './components/Container.js';
import { DetailViewBinding } from './components/DetailView.js';
import { DrawerBinding } from './components/Drawer.js';
import { EmptyStateBinding } from './components/EmptyState.js';
import { GridBinding } from './components/Grid.js';
import { ListBinding } from './components/List.js';
import { MarkdownBinding } from './components/Markdown.js';
import { ModalBinding } from './components/Modal.js';
import { ProgressBinding } from './components/Progress.js';
import { SelectBinding } from './components/Select.js';
import { SkeletonBinding } from './components/Skeleton.js';
import { SpinnerBinding } from './components/Spinner.js';
import { StackBinding } from './components/Stack.js';
import { StatCardBinding } from './components/StatCard.js';
import { TableBinding } from './components/Table.js';
import { TabsBinding } from './components/Tabs.js';
import { TextInputBinding } from './components/TextInput.js';
import { ToastBinding } from './components/Toast.js';

export const COMPONENT_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  Accordion: AccordionBinding,
  Alert: AlertBinding,
  Button: ButtonBinding,
  Card: CardBinding,
  ConfirmDialog: ConfirmDialogBinding,
  Container: ContainerBinding,
  DetailView: DetailViewBinding,
  Drawer: DrawerBinding,
  EmptyState: EmptyStateBinding,
  Grid: GridBinding,
  List: ListBinding,
  Markdown: MarkdownBinding,
  Modal: ModalBinding,
  Progress: ProgressBinding,
  Select: SelectBinding,
  Skeleton: SkeletonBinding,
  Spinner: SpinnerBinding,
  Stack: StackBinding,
  StatCard: StatCardBinding,
  Table: TableBinding,
  Tabs: TabsBinding,
  TextInput: TextInputBinding,
  Toast: ToastBinding,
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
});
