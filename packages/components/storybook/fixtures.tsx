// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { Component, createElement, type ErrorInfo, type ReactElement, type ReactNode } from 'react';

import type { BlockKind, BlockKindRegistry } from '../src/blocks/registry.js';
import { COMPONENT_BINDINGS } from '../src/registry.js';

export interface ComponentStoryFixture {
  title: string;
  description: string;
  props: Record<string, unknown>;
}

export const COMPONENT_STORY_FIXTURES: Readonly<Record<string, ComponentStoryFixture>> =
  Object.freeze({
    Accordion: fixture('Accordion', { items: sampleItems() }),
    ActionMenu: fixture('ActionMenu', { trigger: 'Actions', items: sampleActions() }),
    ActivityFeed: fixture('ActivityFeed', { events: sampleFeed() }),
    Alert: fixture('Alert', { title: 'Policy warning', children: 'This route requires review.' }),
    BlockEditor: fixture('BlockEditor', { blocks: sampleBlocks() }),
    BlockMenu: fixture('BlockMenu', {
      registry: sampleBlockRegistry(),
      surface: 'doc',
      open: false,
      onInsert: () => undefined,
      onClose: () => undefined,
    }),
    Breadcrumb: fixture('Breadcrumb', { items: sampleBreadcrumbs() }),
    BulkActionBar: fixture('BulkActionBar', { count: 3, actions: sampleActions() }),
    Button: fixture('Button', { label: 'Approve', icon: 'check' }),
    ButtonGroup: fixture('ButtonGroup', { buttons: sampleActions() }),
    Calendar: fixture('Calendar', { value: '2026-05-04' }),
    Card: fixture('Card', {
      title: 'Marketplace ops queue',
      subtitle: '14 open exceptions',
      badge: 'Live',
      data: sampleRows()[0],
    }),
    Chart: fixture('Chart', { data: sampleChartData() }),
    ChatThread: fixture('ChatThread', { messages: sampleMessages() }),
    CodeBlock: fixture('CodeBlock', { code: 'capability.dispatch({ id: "order.refund" })' }),
    CodeEditor: fixture('CodeEditor', { value: 'export const policy = "review_required";' }),
    CodeView: fixture('CodeView', { code: 'manifest.policy.status = "valid";' }),
    CommandPalette: fixture('CommandPalette', {
      commands: sampleCommands(),
      open: false,
      onClose: () => undefined,
      bindOpenHotkey: false,
    }),
    Confetti: fixture('Confetti', { active: true, particleCount: 8, durationMs: 1200 }),
    ConfirmDialog: fixture('ConfirmDialog', {
      open: false,
      title: 'Confirm refund',
      description: 'Refund $42.00 to the selected customer?',
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
    Container: fixture('Container', { children: 'Contained workspace section' }),
    DateInput: fixture('DateInput', { label: 'Review date', value: '2026-05-04' }),
    DetailView: fixture('DetailView', { title: 'Order #1042', fields: sampleFields() }),
    DiffView: fixture('DiffView', { before: 'status: pending', after: 'status: approved' }),
    Drawer: fixture('Drawer', {
      open: false,
      title: 'Customer context',
      children: 'Recent activity',
      onClose: () => undefined,
    }),
    DropZone: fixture('DropZone', { children: 'Drop CSV evidence here', accept: ['text/csv'] }),
    EmptyState: fixture('EmptyState', {
      title: 'No exceptions',
      description: 'New policy violations will appear here.',
    }),
    FileUpload: fixture('FileUpload', { label: 'Evidence files' }),
    FilterBar: fixture('FilterBar', { filters: sampleFilters() }),
    FilterQueryBar: fixture('FilterQueryBar', {
      fields: sampleFilterFields(),
      value: [{ field: 'status', op: 'eq', value: 'open', raw: 'status:open' }],
    }),
    Form: fixture('Form', { children: createElement('input', { 'aria-label': 'Internal note' }) }),
    Gallery: fixture('Gallery', { items: sampleGalleryItems() }),
    GenerativeLayout: fixture('GenerativeLayout', {
      initialPrompt: 'Summarize open operational risks',
      generate: () => Promise.resolve({ blocks: sampleGenerativeBlocks(), source: 'fixture' }),
      initialBlocks: sampleGenerativeBlocks(),
      readOnly: true,
    }),
    Grid: fixture('Grid', { items: sampleRows() }),
    HoverCard: fixture('HoverCard', { trigger: 'Customer risk', children: 'High-value account' }),
    Icon: fixture('Icon', { name: 'shield-check', label: 'Validated' }),
    Image: fixture('Image', {
      src: 'https://placehold.co/480x270/e5e7eb/111827?text=Atelier',
      alt: 'Atelier preview',
      caption: 'Generated surface preview',
    }),
    KPIRow: fixture('KPIRow', { stats: sampleKpis() }),
    Kanban: fixture('Kanban', { columns: sampleKanbanColumns() }),
    Lightbox: fixture('Lightbox', { items: sampleGalleryItems(), open: false }),
    List: fixture('List', { items: sampleRows() }),
    Logo: fixture('Logo', { wordmark: 'Atelier', glyph: 'A' }),
    Map: fixture('Map', {
      center: sampleMapCenter(),
      markers: sampleMarkers(),
      ariaLabel: 'Operations map',
    }),
    Markdown: fixture('Markdown', {
      children: '### Runbook\n\n- Validate manifest\n- Dispatch action',
    }),
    MarketplaceBrowser: fixture('MarketplaceBrowser', {}),
    MetaBadge: fixture('MetaBadge', { label: 'Policy', count: 7, dot: true }),
    Modal: fixture('Modal', {
      open: false,
      title: 'Manifest details',
      children: 'Validated at resolver.',
      onClose: () => undefined,
    }),
    MultiPane: fixture('MultiPane', { panes: samplePanes() }),
    MultiSelect: fixture('MultiSelect', { options: sampleOptions(), value: ['ops'] }),
    NavBar: fixture('NavBar', { brand: 'Atelier', items: sampleNavItems() }),
    NumberInput: fixture('NumberInput', { label: 'Threshold', value: 42 }),
    Pagination: fixture('Pagination', { currentPage: 2, totalPages: 8 }),
    Progress: fixture('Progress', { value: 68, label: 'Policy coverage' }),
    Queue: fixture('Queue', { title: 'Review queue', items: sampleRows() }),
    RichText: fixture('RichText', { value: 'Customer asked for a refund exception.' }),
    ScopeSwitcher: fixture('ScopeSwitcher', {
      options: sampleScopes(),
      value: 'ops',
      onChange: () => undefined,
    }),
    Search: fixture('Search', { value: 'refund exceptions', placeholder: 'Search workflows' }),
    Select: fixture('Select', { options: sampleOptions(), value: 'ops' }),
    SelectionActionBar: fixture('SelectionActionBar', {
      surface: 'story-catalog',
      actions: sampleActions(),
    }),
    SettingsSearch: fixture('SettingsSearch', { items: sampleSettings() }),
    Sidebar: fixture('Sidebar', { items: sampleNavItems() }),
    Skeleton: fixture('Skeleton', { lines: 3 }),
    Slider: fixture('Slider', { label: 'Confidence', value: 72, min: 0, max: 100 }),
    Spinner: fixture('Spinner', { label: 'Compiling manifest' }),
    Split: fixture('Split', {
      children: [createElement('div', null, 'Intent'), createElement('div', null, 'Render')],
    }),
    Stack: fixture('Stack', { children: 'Stacked operational controls' }),
    StatCard: fixture('StatCard', {
      label: 'Open',
      value: '14',
      delta: { value: 12, trend: 'down' },
    }),
    StatusBar: fixture('StatusBar', { status: 'success', label: 'All policies passed' }),
    Stepper: fixture('Stepper', { steps: sampleSteps(), current: 1 }),
    Table: fixture('Table', { columns: sampleColumns(), rows: sampleRows() }),
    Tabs: fixture('Tabs', { tabs: sampleTabs() }),
    TextInput: fixture('TextInput', { label: 'Owner', value: 'ops@example.com' }),
    TimeInput: fixture('TimeInput', { label: 'Cutoff', value: '17:30' }),
    Timeline: fixture('Timeline', { entries: sampleTimeline() }),
    Toast: fixture('Toast', { title: 'Manifest cached', description: 'Audit event written.' }),
    Toggle: fixture('Toggle', { label: 'Require verbal confirmation', checked: true }),
    Tooltip: fixture('Tooltip', { label: 'Policy detail', children: 'Requires approval' }),
    TourProgress: fixture('TourProgress', { current: 2, total: 5 }),
    TourStep: fixture('TourStep', {
      target: '#storybook-root',
      title: 'Review generated UI',
      description: 'Check the component state before shipping.',
      open: false,
      step: 2,
      totalSteps: 5,
    }),
    Tree: fixture('Tree', { nodes: sampleTree() }),
    VirtualList: fixture('VirtualList', { items: sampleRows(), viewportHeight: 160 }),
    VirtualTable: fixture('VirtualTable', {
      columns: sampleColumns(),
      rows: sampleRows(),
      viewportHeight: 160,
    }),
    Wizard: fixture('Wizard', { steps: sampleSteps(), current: 1 }),
  });

export const COMPONENT_STORY_IDS = Object.keys(COMPONENT_STORY_FIXTURES).sort();

export function renderComponentStory(id: string): ReactElement {
  const binding = COMPONENT_BINDINGS[id];
  const story = COMPONENT_STORY_FIXTURES[id];
  if (binding === undefined || story === undefined) {
    return createElement(
      'div',
      { 'data-cir-story-error': true },
      `Missing Storybook fixture for ${id}`,
    );
  }

  return createElement(
    StoryFixtureBoundary,
    { id },
    createElement(binding.factory as React.ComponentType<Record<string, unknown>>, story.props),
  );
}

interface StoryFixtureBoundaryProps {
  id: string;
  children: ReactNode;
}

interface StoryFixtureBoundaryState {
  error: Error | null;
}

class StoryFixtureBoundary extends Component<StoryFixtureBoundaryProps, StoryFixtureBoundaryState> {
  override state: StoryFixtureBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StoryFixtureBoundaryState {
    return { error };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Keep the catalog reviewable when one fixture drifts; the visual gate
    // captures the inline error card instead of hiding the regression.
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return createElement(
        'div',
        { 'data-cir-story-error': true },
        `${this.props.id} fixture failed: ${this.state.error.message}`,
      );
    }

    return this.props.children;
  }
}

function fixture(id: string, props: Record<string, unknown> = {}): ComponentStoryFixture {
  return {
    title: id,
    description: `Baseline ${id} fixture for generated UI review.`,
    props,
  };
}

function sampleActions(): Array<Record<string, unknown>> {
  return [
    { id: 'approve', label: 'Approve', onSelect: () => undefined },
    { id: 'assign', label: 'Assign', onSelect: () => undefined },
    { id: 'escalate', label: 'Escalate', onSelect: () => undefined },
  ];
}

function sampleCommands(): Array<Record<string, unknown>> {
  return [
    {
      id: 'assign-owner',
      label: 'Assign owner',
      description: 'Route this workflow to the operations owner.',
      group: 'Workflow',
      run: () => undefined,
    },
    {
      id: 'open-audit',
      label: 'Open audit trail',
      description: 'Review resolver and action-dispatch events.',
      group: 'Audit',
      run: () => undefined,
    },
  ];
}

function sampleItems(): Array<Record<string, unknown>> {
  return [
    { id: 'policy', title: 'Policy validation', content: 'Resolver enforced.' },
    { id: 'audit', title: 'Audit trail', content: 'Dispatch recorded.' },
  ];
}

function sampleBlockRegistry(): BlockKindRegistry {
  const kinds: readonly BlockKind[] = Object.freeze([
    {
      id: 'text.paragraph',
      label: 'Paragraph',
      description: 'Plain text block',
      group: 'Text',
      insert: () => undefined,
    },
    {
      id: 'text.heading',
      label: 'Heading',
      description: 'Section heading',
      group: 'Text',
      insert: () => undefined,
    },
  ]);

  return {
    add: () => undefined,
    list: () => kinds,
    remove: () => undefined,
    subscribe: () => () => undefined,
  };
}

function sampleRows(): Array<Record<string, unknown>> {
  return [
    { id: 'ord-1042', title: 'Refund exception', status: 'Open', owner: 'Maya' },
    { id: 'ord-1043', title: 'Address review', status: 'Pending', owner: 'Ilya' },
    { id: 'ord-1044', title: 'Compliance hold', status: 'Done', owner: 'Nia' },
  ];
}

function sampleColumns(): Array<Record<string, unknown>> {
  return [
    { key: 'title', header: 'Workflow' },
    { key: 'status', header: 'Status' },
    { key: 'owner', header: 'Owner' },
  ];
}

function sampleFeed(): Array<Record<string, unknown>> {
  return [
    {
      id: '1',
      type: 'manifest_compiled',
      label: 'Manifest regenerated',
      actor: { id: 'compiler', name: 'Compiler' },
      timestamp: '2026-05-04T09:30:00.000Z',
    },
    {
      id: '2',
      type: 'policy_required',
      label: 'Confirmation required',
      actor: { id: 'policy', name: 'Policy' },
      timestamp: '2026-05-04T09:35:00.000Z',
    },
  ];
}

function sampleBreadcrumbs(): Array<Record<string, unknown>> {
  return [
    { label: 'Operations', href: '#' },
    { label: 'Refunds', href: '#' },
    { label: 'Exceptions' },
  ];
}

function sampleBlocks(): Array<Record<string, unknown>> {
  return [
    { id: 'summary', type: 'text', content: 'Generated summary block' },
    { id: 'next', type: 'action', content: 'Recommended next action' },
  ];
}

function sampleGenerativeBlocks(): Array<Record<string, unknown>> {
  return [
    { id: 'heading', kind: 'heading', content: 'Operational risk brief', level: 2 },
    { id: 'summary', kind: 'paragraph', content: 'Three exceptions need owner review.' },
    { id: 'callout', kind: 'callout', content: 'All actions require audit.', tone: 'info' },
  ];
}

function sampleChartData(): Array<Record<string, unknown>> {
  return [
    { label: 'Mon', value: 12 },
    { label: 'Tue', value: 18 },
    { label: 'Wed', value: 9 },
  ];
}

function sampleMessages(): Array<Record<string, unknown>> {
  return [
    { id: '1', role: 'user', content: 'Why was this order held?' },
    { id: '2', role: 'assistant', content: 'The policy requires manual review.' },
  ];
}

function sampleFields(): Array<Record<string, unknown>> {
  return [
    { label: 'Customer', value: 'Acme Support' },
    { label: 'Risk', value: 'Medium' },
    { label: 'Owner', value: 'Maya' },
  ];
}

function sampleFilters(): Array<Record<string, unknown>> {
  return [
    { id: 'status', label: 'Status', value: 'Open' },
    { id: 'owner', label: 'Owner', value: 'Me' },
  ];
}

function sampleFilterFields(): Array<Record<string, unknown>> {
  return [
    { key: 'status', label: 'Status', values: ['open', 'pending', 'done'] },
    { key: 'owner', label: 'Owner', freeform: true },
    { key: 'priority', label: 'Priority', values: ['high', 'medium', 'low'] },
  ];
}

function sampleGalleryItems(): Array<Record<string, unknown>> {
  return [
    {
      id: 'preview',
      src: 'https://placehold.co/320x180/e5e7eb/111827?text=Preview',
      alt: 'Preview',
    },
  ];
}

function sampleKpis(): Array<Record<string, unknown>> {
  return [
    { label: 'Open', value: '14' },
    { label: 'SLA', value: '98%' },
    { label: 'Risk', value: 'Low' },
  ];
}

function sampleKanbanColumns(): Array<Record<string, unknown>> {
  return [
    { id: 'todo', title: 'To do', cards: sampleRows().slice(0, 1) },
    { id: 'doing', title: 'Doing', cards: sampleRows().slice(1, 2) },
    { id: 'done', title: 'Done', cards: sampleRows().slice(2) },
  ];
}

function sampleMarkers(): Array<Record<string, unknown>> {
  return [{ id: 'sf', label: 'San Francisco', lat: 37.7749, lng: -122.4194 }];
}

function sampleMapCenter(): Record<string, unknown> {
  return { lat: 37.7749, lng: -122.4194 };
}

function samplePanes(): Array<Record<string, unknown>> {
  return [
    { id: 'left', title: 'Queue', content: 'Open work' },
    { id: 'main', title: 'Case', content: 'Selected workflow' },
    { id: 'right', title: 'Audit', content: 'Recent events' },
  ];
}

function sampleOptions(): Array<Record<string, unknown>> {
  return [
    { label: 'Operations', value: 'ops' },
    { label: 'Compliance', value: 'compliance' },
  ];
}

function sampleNavItems(): Array<Record<string, unknown>> {
  return [
    { label: 'Queue', href: '#' },
    { label: 'Policies', href: '#' },
    { label: 'Audit', href: '#' },
  ];
}

function sampleScopes(): Array<Record<string, unknown>> {
  return [
    { id: 'ops', label: 'Ops', group: 'Teams' },
    { id: 'compliance', label: 'Compliance', group: 'Teams' },
  ];
}

function sampleSettings(): Array<Record<string, unknown>> {
  return [
    { id: 'confirmations', label: 'Confirmations', category: 'Policy' },
    { id: 'audit', label: 'Audit retention', category: 'Operations' },
  ];
}

function sampleSteps(): Array<Record<string, unknown>> {
  return [
    { id: 'capability', title: 'Capability' },
    { id: 'manifest', title: 'Manifest' },
    { id: 'dispatch', title: 'Dispatch' },
  ];
}

function sampleTabs(): Array<Record<string, unknown>> {
  return [
    { id: 'overview', label: 'Overview', content: 'Manifest summary' },
    { id: 'audit', label: 'Audit', content: 'Dispatch events' },
  ];
}

function sampleTimeline(): Array<Record<string, unknown>> {
  return [
    { id: 'compile', title: 'Compiled', time: '09:30', status: 'done' },
    { id: 'validate', title: 'Validated', time: '09:31', status: 'done' },
  ];
}

function sampleTree(): Array<Record<string, unknown>> {
  return [
    {
      id: 'root',
      label: 'Manifest',
      children: [{ id: 'node-1', label: 'Action node' }],
    },
  ];
}
