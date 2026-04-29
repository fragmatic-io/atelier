import { describe, expect, it } from 'vitest';
import { COMPONENT_BINDINGS } from '../src/registry.js';
import { TEXT_RENDERERS } from '../src/text-render.js';

describe('TEXT_RENDERERS', () => {
  it('covers every component in the registry', () => {
    expect(Object.keys(TEXT_RENDERERS).sort()).toEqual(Object.keys(COMPONENT_BINDINGS).sort());
  });

  it('every renderer returns a non-empty string for plausible props', () => {
    const samples: Readonly<Record<string, unknown>> = {
      Accordion: { items: [{ id: 'a', header: 'h', content: 'c' }] },
      Alert: { severity: 'info', title: 'Notice' },
      Button: { children: 'OK', variant: 'primary' },
      Card: { title: 'Card title' },
      ConfirmDialog: { title: 'Delete?', onConfirm: () => undefined, onCancel: () => undefined },
      Container: { maxWidth: 'md' },
      DetailView: { fields: [{ label: 'Name', value: 'Ada' }] },
      Drawer: { open: true, side: 'right', title: 'Filters', onClose: () => undefined },
      EmptyState: { title: 'Nothing here', description: 'try again' },
      Grid: { columns: 3 },
      List: { items: [1, 2, 3], renderItem: (n: number) => String(n) },
      Markdown: { content: '# hello' },
      Modal: { open: true, title: 'Edit', onClose: () => undefined },
      Progress: { value: 42 },
      Select: {
        label: 'Fruit',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
        value: 'a',
      },
      Skeleton: {},
      Spinner: { label: 'Loading' },
      Stack: { direction: 'horizontal' },
      StatCard: { label: 'Revenue', value: '$1.2M' },
      Table: { columns: [{ key: 'k', header: 'h' }], rows: [{ k: 'v' }] },
      Tabs: { tabs: [{ id: 'a', label: 'A', content: '...' }] },
      TextInput: { label: 'Email' },
      Toast: { message: 'Saved', open: true, onClose: () => undefined },
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
