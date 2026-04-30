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
import { actionMenuTextRender } from './components/ActionMenu.js';
import { alertTextRender } from './components/Alert.js';
import { breadcrumbTextRender } from './components/Breadcrumb.js';
import { bulkActionBarTextRender } from './components/BulkActionBar.js';
import { buttonTextRender } from './components/Button.js';
import { buttonGroupTextRender } from './components/ButtonGroup.js';
import { calendarTextRender } from './components/Calendar.js';
import { cardTextRender } from './components/Card.js';
import { chartTextRender } from './components/Chart.js';
import { chatThreadTextRender } from './components/ChatThread.js';
import { codeBlockTextRender } from './components/CodeBlock.js';
import { codeEditorTextRender } from './components/CodeEditor.js';
import { codeViewTextRender } from './components/CodeView.js';
import { commandPaletteTextRender } from './components/CommandPalette.js';
import { confirmDialogTextRender } from './components/ConfirmDialog.js';
import { containerTextRender } from './components/Container.js';
import { dateInputTextRender } from './components/DateInput.js';
import { detailViewTextRender } from './components/DetailView.js';
import { diffViewTextRender } from './components/DiffView.js';
import { drawerTextRender } from './components/Drawer.js';
import { emptyStateTextRender } from './components/EmptyState.js';
import { fileUploadTextRender } from './components/FileUpload.js';
import { filterBarTextRender } from './components/FilterBar.js';
import { formTextRender } from './components/Form.js';
import { galleryTextRender } from './components/Gallery.js';
import { gridTextRender } from './components/Grid.js';
import { hoverCardTextRender } from './components/HoverCard.js';
import { iconTextRender } from './components/Icon.js';
import { kpiRowTextRender } from './components/KPIRow.js';
import { kanbanTextRender } from './components/Kanban.js';
import { listTextRender } from './components/List.js';
import { mapTextRender } from './components/Map.js';
import { markdownTextRender } from './components/Markdown.js';
import { modalTextRender } from './components/Modal.js';
import { multiSelectTextRender } from './components/MultiSelect.js';
import { navBarTextRender } from './components/NavBar.js';
import { numberInputTextRender } from './components/NumberInput.js';
import { paginationTextRender } from './components/Pagination.js';
import { progressTextRender } from './components/Progress.js';
import { richTextTextRender } from './components/RichText.js';
import { searchTextRender } from './components/Search.js';
import { selectTextRender } from './components/Select.js';
import { sidebarTextRender } from './components/Sidebar.js';
import { skeletonTextRender } from './components/Skeleton.js';
import { sliderTextRender } from './components/Slider.js';
import { spinnerTextRender } from './components/Spinner.js';
import { splitTextRender } from './components/Split.js';
import { stackTextRender } from './components/Stack.js';
import { statCardTextRender } from './components/StatCard.js';
import { stepperTextRender } from './components/Stepper.js';
import { tableTextRender } from './components/Table.js';
import { tabsTextRender } from './components/Tabs.js';
import { statusBarTextRender } from './components/StatusBar.js';
import { textInputTextRender } from './components/TextInput.js';
import { timeInputTextRender } from './components/TimeInput.js';
import { timelineTextRender } from './components/Timeline.js';
import { toastTextRender } from './components/Toast.js';
import { toggleTextRender } from './components/Toggle.js';
import { tooltipTextRender } from './components/Tooltip.js';
import { treeTextRender } from './components/Tree.js';
import { wizardTextRender } from './components/Wizard.js';

/** Returns a plain-text representation of a component for non-visual render targets. */
export type TextRenderer<TProps = unknown> = (props: TProps) => string;

export const TEXT_RENDERERS: Readonly<Record<string, TextRenderer>> = Object.freeze({
  Accordion: accordionTextRender as TextRenderer,
  ActionMenu: actionMenuTextRender as TextRenderer,
  Alert: alertTextRender as TextRenderer,
  Breadcrumb: breadcrumbTextRender as TextRenderer,
  BulkActionBar: bulkActionBarTextRender as TextRenderer,
  Button: buttonTextRender as TextRenderer,
  ButtonGroup: buttonGroupTextRender as TextRenderer,
  Calendar: calendarTextRender as TextRenderer,
  Card: cardTextRender as TextRenderer,
  Chart: chartTextRender as TextRenderer,
  ChatThread: chatThreadTextRender as TextRenderer,
  CodeBlock: codeBlockTextRender as TextRenderer,
  CodeEditor: codeEditorTextRender as TextRenderer,
  CodeView: codeViewTextRender as TextRenderer,
  CommandPalette: commandPaletteTextRender as TextRenderer,
  ConfirmDialog: confirmDialogTextRender as TextRenderer,
  Container: containerTextRender as TextRenderer,
  DateInput: dateInputTextRender as TextRenderer,
  DetailView: detailViewTextRender as TextRenderer,
  DiffView: diffViewTextRender as TextRenderer,
  Drawer: drawerTextRender as TextRenderer,
  EmptyState: emptyStateTextRender as TextRenderer,
  FileUpload: fileUploadTextRender as TextRenderer,
  FilterBar: filterBarTextRender as TextRenderer,
  Form: formTextRender as TextRenderer,
  Gallery: galleryTextRender as TextRenderer,
  Grid: gridTextRender as TextRenderer,
  HoverCard: hoverCardTextRender as TextRenderer,
  Icon: iconTextRender as TextRenderer,
  KPIRow: kpiRowTextRender as TextRenderer,
  Kanban: kanbanTextRender as TextRenderer,
  List: listTextRender as TextRenderer,
  Map: mapTextRender as TextRenderer,
  Markdown: markdownTextRender as TextRenderer,
  Modal: modalTextRender as TextRenderer,
  MultiSelect: multiSelectTextRender as TextRenderer,
  NavBar: navBarTextRender as TextRenderer,
  NumberInput: numberInputTextRender as TextRenderer,
  Pagination: paginationTextRender as TextRenderer,
  Progress: progressTextRender as TextRenderer,
  RichText: richTextTextRender as TextRenderer,
  Search: searchTextRender as TextRenderer,
  Select: selectTextRender as TextRenderer,
  Sidebar: sidebarTextRender as TextRenderer,
  Skeleton: skeletonTextRender as TextRenderer,
  Slider: sliderTextRender as TextRenderer,
  Spinner: spinnerTextRender as TextRenderer,
  Split: splitTextRender as TextRenderer,
  Stack: stackTextRender as TextRenderer,
  StatCard: statCardTextRender as TextRenderer,
  StatusBar: statusBarTextRender as TextRenderer,
  Stepper: stepperTextRender as TextRenderer,
  Table: tableTextRender as TextRenderer,
  Tabs: tabsTextRender as TextRenderer,
  TextInput: textInputTextRender as TextRenderer,
  TimeInput: timeInputTextRender as TextRenderer,
  Timeline: timelineTextRender as TextRenderer,
  Toast: toastTextRender as TextRenderer,
  Toggle: toggleTextRender as TextRenderer,
  Tooltip: tooltipTextRender as TextRenderer,
  Tree: treeTextRender as TextRenderer,
  Wizard: wizardTextRender as TextRenderer,
});
