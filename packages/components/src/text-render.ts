// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Text-render manifest — a plain-text representation per component.
 *
 * Required by `/Users/vid/cir/docs/chat/multi-modal.md` §"Text fallback":
 * every component must be renderable as text for voice agents, screen
 * readers, terminal UIs, and graceful degradation. Children are typically
 * rendered separately by the caller; these renderers describe ONLY the
 * component itself.
 *
 * Keep each one a single line. The aggregate output is composed by walking
 * the render plan and concatenating with newlines or separators per the
 * target context.
 */
import { accordionTextRender } from './components/Accordion.js';
import { alertTextRender } from './components/Alert.js';
import { buttonTextRender } from './components/Button.js';
import { cardTextRender } from './components/Card.js';
import { confirmDialogTextRender } from './components/ConfirmDialog.js';
import { containerTextRender } from './components/Container.js';
import { detailViewTextRender } from './components/DetailView.js';
import { drawerTextRender } from './components/Drawer.js';
import { emptyStateTextRender } from './components/EmptyState.js';
import { gridTextRender } from './components/Grid.js';
import { listTextRender } from './components/List.js';
import { markdownTextRender } from './components/Markdown.js';
import { modalTextRender } from './components/Modal.js';
import { progressTextRender } from './components/Progress.js';
import { selectTextRender } from './components/Select.js';
import { skeletonTextRender } from './components/Skeleton.js';
import { spinnerTextRender } from './components/Spinner.js';
import { stackTextRender } from './components/Stack.js';
import { statCardTextRender } from './components/StatCard.js';
import { tableTextRender } from './components/Table.js';
import { tabsTextRender } from './components/Tabs.js';
import { textInputTextRender } from './components/TextInput.js';
import { toastTextRender } from './components/Toast.js';

/** Returns a plain-text representation of a component for non-visual render targets. */
export type TextRenderer<TProps = unknown> = (props: TProps) => string;

export const TEXT_RENDERERS: Readonly<Record<string, TextRenderer>> = Object.freeze({
  Accordion: accordionTextRender as TextRenderer,
  Alert: alertTextRender as TextRenderer,
  Button: buttonTextRender as TextRenderer,
  Card: cardTextRender as TextRenderer,
  ConfirmDialog: confirmDialogTextRender as TextRenderer,
  Container: containerTextRender as TextRenderer,
  DetailView: detailViewTextRender as TextRenderer,
  Drawer: drawerTextRender as TextRenderer,
  EmptyState: emptyStateTextRender as TextRenderer,
  Grid: gridTextRender as TextRenderer,
  List: listTextRender as TextRenderer,
  Markdown: markdownTextRender as TextRenderer,
  Modal: modalTextRender as TextRenderer,
  Progress: progressTextRender as TextRenderer,
  Select: selectTextRender as TextRenderer,
  Skeleton: skeletonTextRender as TextRenderer,
  Spinner: spinnerTextRender as TextRenderer,
  Stack: stackTextRender as TextRenderer,
  StatCard: statCardTextRender as TextRenderer,
  Table: tableTextRender as TextRenderer,
  Tabs: tabsTextRender as TextRenderer,
  TextInput: textInputTextRender as TextRenderer,
  Toast: toastTextRender as TextRenderer,
});
