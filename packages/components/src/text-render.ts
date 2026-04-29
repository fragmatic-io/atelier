// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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
import { alertTextRender } from './components/Alert.js';
import { buttonTextRender } from './components/Button.js';
import { cardTextRender } from './components/Card.js';
import { confirmDialogTextRender } from './components/ConfirmDialog.js';
import { containerTextRender } from './components/Container.js';
import { emptyStateTextRender } from './components/EmptyState.js';
import { gridTextRender } from './components/Grid.js';
import { markdownTextRender } from './components/Markdown.js';
import { selectTextRender } from './components/Select.js';
import { spinnerTextRender } from './components/Spinner.js';
import { stackTextRender } from './components/Stack.js';
import { tableTextRender } from './components/Table.js';
import { textInputTextRender } from './components/TextInput.js';

/** Returns a plain-text representation of a component for non-visual render targets. */
export type TextRenderer<TProps = unknown> = (props: TProps) => string;

export const TEXT_RENDERERS: Readonly<Record<string, TextRenderer>> = Object.freeze({
  Alert: alertTextRender as TextRenderer,
  Button: buttonTextRender as TextRenderer,
  Card: cardTextRender as TextRenderer,
  ConfirmDialog: confirmDialogTextRender as TextRenderer,
  Container: containerTextRender as TextRenderer,
  EmptyState: emptyStateTextRender as TextRenderer,
  Grid: gridTextRender as TextRenderer,
  Markdown: markdownTextRender as TextRenderer,
  Select: selectTextRender as TextRenderer,
  Spinner: spinnerTextRender as TextRenderer,
  Stack: stackTextRender as TextRenderer,
  Table: tableTextRender as TextRenderer,
  TextInput: textInputTextRender as TextRenderer,
});
