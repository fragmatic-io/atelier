import { describe, expect, it } from 'vitest';
import { COMPONENT_BINDINGS } from '../src/registry.js';
import { TEXT_RENDERERS } from '../src/text-render.js';

describe('TEXT_RENDERERS', () => {
  it('covers every component in the registry', () => {
    expect(Object.keys(TEXT_RENDERERS).sort()).toEqual(Object.keys(COMPONENT_BINDINGS).sort());
  });

  it('every renderer returns a non-empty string for plausible props', () => {
    const samples: Readonly<Record<string, unknown>> = {
      Alert: { severity: 'info', title: 'Notice' },
      Button: { children: 'OK', variant: 'primary' },
      Card: { title: 'Card title' },
      ConfirmDialog: { title: 'Delete?', onConfirm: () => undefined, onCancel: () => undefined },
      Container: { maxWidth: 'md' },
      EmptyState: { title: 'Nothing here', description: 'try again' },
      Grid: { columns: 3 },
      Markdown: { content: '# hello' },
      Select: {
        label: 'Fruit',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
        value: 'a',
      },
      Spinner: { label: 'Loading' },
      Stack: { direction: 'horizontal' },
      Table: { columns: [{ key: 'k', header: 'h' }], rows: [{ k: 'v' }] },
      TextInput: { label: 'Email' },
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
});
