// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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

import { AlertBinding } from './components/Alert.js';
import { ButtonBinding } from './components/Button.js';
import { CardBinding } from './components/Card.js';
import { ConfirmDialogBinding } from './components/ConfirmDialog.js';
import { ContainerBinding } from './components/Container.js';
import { EmptyStateBinding } from './components/EmptyState.js';
import { GridBinding } from './components/Grid.js';
import { MarkdownBinding } from './components/Markdown.js';
import { SelectBinding } from './components/Select.js';
import { SpinnerBinding } from './components/Spinner.js';
import { StackBinding } from './components/Stack.js';
import { TableBinding } from './components/Table.js';
import { TextInputBinding } from './components/TextInput.js';

export const COMPONENT_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  Alert: AlertBinding,
  Button: ButtonBinding,
  Card: CardBinding,
  ConfirmDialog: ConfirmDialogBinding,
  Container: ContainerBinding,
  EmptyState: EmptyStateBinding,
  Grid: GridBinding,
  Markdown: MarkdownBinding,
  Select: SelectBinding,
  Spinner: SpinnerBinding,
  Stack: StackBinding,
  Table: TableBinding,
  TextInput: TextInputBinding,
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
  // Display.
  Table: { can_contain: 'leaf' },
  // Leaves: no children.
  Markdown: { can_contain: 'leaf' },
  EmptyState: { can_contain: 'leaf' },
  Button: { can_contain: 'leaf' },
  TextInput: { can_contain: 'leaf' },
  Select: { can_contain: 'leaf' },
  Alert: { can_contain: 'leaf' },
  Spinner: { can_contain: 'leaf' },
  // Action: ConfirmDialog renders its own buttons internally; manifest authors
  // do not nest children inside it.
  ConfirmDialog: { can_contain: 'leaf' },
});
