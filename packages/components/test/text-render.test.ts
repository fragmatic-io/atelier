import { describe, expect, it } from 'vitest';
import { COMPONENT_BINDINGS } from '../src/registry.js';
import { TEXT_RENDERERS } from '../src/text-render.js';
import { InMemoryBlockKindRegistry } from '../src/blocks/registry.js';

describe('TEXT_RENDERERS', () => {
  it('covers every component in the registry', () => {
    expect(Object.keys(TEXT_RENDERERS).sort()).toEqual(Object.keys(COMPONENT_BINDINGS).sort());
  });

  it('every renderer returns a non-empty string for plausible props', () => {
    const samples: Readonly<Record<string, unknown>> = {
      Accordion: { items: [{ id: 'a', header: 'h', content: 'c' }] },
      ActivityFeed: {
        events: [
          {
            id: 'e1',
            type: 'status_changed',
            label: 'changed status to In Progress',
            timestamp: '2026-05-02T12:00:00Z',
          },
        ],
      },
      Calendar: { ariaLabel: 'Pick a date', month: '2026-04' },
      ChatThread: {
        messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      },
      Chart: { kind: 'line', data: [{ x: '2026-01', y: 1 }] },
      CodeEditor: { value: 'x', onChange: () => undefined, label: 'Code' },
      CodeView: { code: 'x' },
      DiffView: { hunks: [{ kind: 'add', text: 'x' }] },
      Kanban: {
        columns: [{ id: 'todo', title: 'To Do', cards: [{ id: 'a', title: 'A' }] }],
      },
      Map: { center: { lat: 0, lng: 0 }, markers: [{ id: 'm', lat: 0, lng: 0 }] },
      RichText: { value: '', onChange: () => undefined, label: 'Body' },
      Sidebar: { items: [{ id: 'home', label: 'Home', href: '/' }] },
      Split: { children: 'x' },
      Timeline: { entries: [{ id: 'e', title: 't' }] },
      Tree: { nodes: [{ id: 'n', label: 'n' }] },
      ActionMenu: {
        trigger: 'Open',
        items: [{ id: 'x', label: 'Item', onSelect: () => undefined }],
      },
      Alert: { severity: 'info', title: 'Notice' },
      Breadcrumb: { items: [{ label: 'Home', href: '/' }] },
      Button: { children: 'OK', variant: 'primary' },
      ButtonGroup: { 'aria-label': 'Toolbar', children: 'x' },
      Card: { title: 'Card title' },
      CommandPalette: {
        open: true,
        commands: [{ id: 'c1', label: 'Open', onSelect: () => undefined }],
        onClose: () => undefined,
      },
      ConfirmDialog: { title: 'Delete?', onConfirm: () => undefined, onCancel: () => undefined },
      Container: { maxWidth: 'md' },
      DateInput: { label: 'Date' },
      DetailView: { fields: [{ label: 'Name', value: 'Ada' }] },
      Drawer: { open: true, side: 'right', title: 'Filters', onClose: () => undefined },
      DropZone: { host: false },
      EmptyState: { title: 'Nothing here', description: 'try again' },
      FileUpload: { label: 'Upload', onFiles: () => undefined },
      FilterBar: {
        filters: [{ id: 'q', label: 'Query', type: 'search' }],
        onChange: () => undefined,
      },
      FilterQueryBar: {
        fields: [{ key: 'assignee' }],
      },
      Form: { onSubmit: () => undefined },
      Gallery: {
        items: [{ id: '1', src: 'a.png', alt: 'A' }],
      },
      // Wave 11 / AI-3 — generative layout panel.
      GenerativeLayout: {
        initialPrompt: 'Pitch deck for a vegan kombucha startup',
        initialBlocks: [{ id: 'b1', kind: 'paragraph', content: 'Hi' }],
      },
      Grid: { columns: 3 },
      Icon: { set: 'lucide', name: 'archive' },
      KPIRow: {
        stats: [{ id: 's1', label: 'Users', value: 1234 }],
      },
      List: { items: [1, 2, 3], renderItem: (n: number) => String(n) },
      Logo: { wordmark: 'Aurora' },
      Markdown: { content: '# hello' },
      // Wave 8 / V-6.c — vault-marketplace browse UI.
      MarketplaceBrowser: {
        client: {
          list: () => Promise.resolve([]),
          get: () => Promise.resolve(null),
        },
      },
      MetaBadge: { count: 5, label: 'unread' },
      Modal: { open: true, title: 'Edit', onClose: () => undefined },
      MultiPane: {
        panes: [
          { id: 'sidebar', label: 'Sidebar', pane: 's' },
          { id: 'main', label: 'Main', pane: 'm' },
          { id: 'thread', label: 'Thread', collapsible: true, pane: 't' },
        ],
      },
      MultiSelect: {
        label: 'Tags',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        values: ['a'],
        onChange: () => undefined,
      },
      NavBar: { items: [{ label: 'Home', href: '/' }] },
      NumberInput: { label: 'Quantity', value: 1, onChange: () => undefined },
      Pagination: { currentPage: 1, totalPages: 5, onPageChange: () => undefined },
      Progress: { value: 42 },
      Queue: { items: [{ id: 'a', title: 'Renew domain' }], title: 'Decisions' },
      ScopeSwitcher: {
        options: [
          { id: 'workspace-acme', label: 'Acme', group: 'Workspaces' },
          { id: 'team-platform', label: 'Platform', group: 'Teams' },
        ],
        value: 'workspace-acme',
        onChange: () => undefined,
      },
      Search: { value: 'tea', onChange: () => undefined },
      SelectionActionBar: {},
      SettingsSearch: {
        items: [{ id: 'billing', label: 'Billing', href: '/settings/billing' }],
        onSelect: () => undefined,
      },
      Select: {
        label: 'Fruit',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
        value: 'a',
      },
      Skeleton: {},
      Slider: { label: 'Volume', value: 50, min: 0, max: 100, onChange: () => undefined },
      Spinner: { label: 'Loading' },
      Stack: { direction: 'horizontal' },
      StatCard: { label: 'Revenue', value: '$1.2M' },
      Stepper: {
        steps: [
          { id: 'a', title: 'A', status: 'done' },
          { id: 'b', title: 'B', status: 'active' },
        ],
      },
      Table: { columns: [{ key: 'k', header: 'h' }], rows: [{ k: 'v' }] },
      Tabs: { tabs: [{ id: 'a', label: 'A', content: '...' }] },
      TextInput: { label: 'Email' },
      TimeInput: { label: 'Time' },
      Toast: { message: 'Saved', open: true, onClose: () => undefined },
      Toggle: { label: 'Notifications', checked: true, onChange: () => undefined },
      Tooltip: { content: 'Help text', children: { type: 'span', props: {}, key: null } },
      HoverCard: { content: 'Preview text', children: { type: 'span', props: {}, key: null } },
      StatusBar: { status: 'operational', message: 'All systems green' },
      CodeBlock: { code: 'const x = 1;', language: 'typescript' },
      BulkActionBar: {
        selectionCount: 3,
        actions: [{ id: 'github.issue.bulk_archive', label: 'Archive' }],
        onAction: () => undefined,
        onClear: () => undefined,
      },
      BlockMenu: {
        registry: new InMemoryBlockKindRegistry(),
        surface: 'doc',
        open: true,
        onInsert: () => undefined,
        onClose: () => undefined,
      },
      BlockEditor: {
        blocks: [
          { id: 'b1', type: 'paragraph', content: 'Hello' },
          { id: 'b2', type: 'heading', content: 'Title', meta: { level: 1 } },
        ],
        onChange: () => undefined,
      },
      Wizard: {
        steps: [
          { id: 'a', title: 'A', content: 'a' },
          { id: 'b', title: 'B', content: 'b' },
        ],
        currentId: 'a',
        onStepChange: () => undefined,
      },
      // Wave 10 / S-2 — virtualized list + table samples for the
      // text-renderer coverage gate.
      VirtualList: { items: [1, 2, 3], total: 30 },
      VirtualTable: {
        columns: [{ key: 'k', header: 'h' }],
        rows: [{ k: 'v' }, { k: 'w' }],
        total: 1000,
      },
      // Wave 11 / Int-5 — onboarding microinteractions.
      TourStep: { target: '#x', title: 'Welcome', step: 1, totalSteps: 3 },
      TourProgress: { current: 2, total: 5 },
      Confetti: { active: true },
      // Wave 11 / Int-14 — single-image leaf + fullscreen lightbox.
      Image: { src: '/a.jpg', alt: 'A photo' },
      Lightbox: {
        items: [{ src: '/a.jpg', alt: 'A' }],
        open: false,
        onClose: () => undefined,
      },
    };

    for (const [id, renderer] of Object.entries(TEXT_RENDERERS)) {
      const out = renderer(samples[id]);
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it('Markdown text-render returns the verbatim content', () => {
    expect(TEXT_RENDERERS['Markdown']!({ content: 'hello' })).toBe('hello');
  });

  it('Button text-render formats label inline', () => {
    expect(TEXT_RENDERERS['Button']!({ children: 'OK' })).toBe('[Button: OK]');
    expect(TEXT_RENDERERS['Button']!({})).toBe('[Button]');
  });

  it('Progress indeterminate vs value', () => {
    expect(TEXT_RENDERERS['Progress']!({})).toBe('[Progress: indeterminate]');
    expect(TEXT_RENDERERS['Progress']!({ value: 75 })).toBe('[Progress: 75%]');
  });
});
