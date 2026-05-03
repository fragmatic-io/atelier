// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  BlockEditor,
  BlockEditorBinding,
  blockEditorTextRender,
  type Block,
} from '../src/components/BlockEditor.js';

/**
 * Controlled host wrapper. The editor is fully controlled (host owns
 * `blocks`); these tests need to mirror that contract so structural
 * mutations land in subsequent renders.
 */
function HostedEditor(props: {
  initial: readonly Block[];
  draggable?: boolean;
  onChangeSpy?: (next: readonly Block[]) => void;
}): React.ReactElement {
  const [blocks, setBlocks] = useState<readonly Block[]>(props.initial);
  return (
    <BlockEditor
      blocks={blocks}
      draggable={props.draggable ?? false}
      onChange={(next) => {
        setBlocks(next);
        props.onChangeSpy?.(next);
      }}
    />
  );
}

const ALL_EIGHT: readonly Block[] = [
  { id: 'p1', type: 'paragraph', content: 'a paragraph' },
  { id: 'h1', type: 'heading', content: 'A heading', meta: { level: 1 } },
  { id: 'c1', type: 'callout', content: 'Watch out', meta: { severity: 'warning' } },
  {
    id: 't1',
    type: 'toggle',
    content: 'Click to expand',
    children: [{ id: 'tc1', type: 'paragraph', content: 'inside' }],
  },
  { id: 'co1', type: 'code', content: 'const x = 1', meta: { language: 'typescript' } },
  { id: 'e1', type: 'embed', content: '', meta: { url: 'https://example.com' } },
  { id: 'q1', type: 'quote', content: 'a quote' },
  { id: 'd1', type: 'divider' },
];

describe('BlockEditor', () => {
  it('renders all 8 baseline block types', () => {
    render(<HostedEditor initial={ALL_EIGHT} />);
    // Toggle has a nested child block as well, so we filter top-level rows
    // by walking the editor list's direct children manually (happy-dom does
    // not support `:scope >` selectors reliably).
    const list = document.querySelector('[data-cir-part="block-editor-list"]') as HTMLElement;
    const topLevel = Array.from(list.children).filter((el) => el.matches('[data-cir-block]'));
    expect(topLevel.length).toBe(8);
    const types = topLevel.map((el) => el.getAttribute('data-cir-block-type'));
    expect(types).toEqual([
      'paragraph',
      'heading',
      'callout',
      'toggle',
      'code',
      'embed',
      'quote',
      'divider',
    ]);
    // Sanity: blocks count is at least the 8 top-level ones.
    const all = document.querySelectorAll('[data-cir-block]');
    expect(all.length).toBeGreaterThanOrEqual(8);
  });

  it('heading honours meta.level (h1 / h2 / h3)', () => {
    render(
      <HostedEditor
        initial={[
          { id: 'h1', type: 'heading', content: 'one', meta: { level: 1 } },
          { id: 'h2', type: 'heading', content: 'two', meta: { level: 2 } },
          { id: 'h3', type: 'heading', content: 'three', meta: { level: 3 } },
        ]}
      />,
    );
    expect(document.querySelector('h1[data-cir-part="block-heading"]')).not.toBeNull();
    expect(document.querySelector('h2[data-cir-part="block-heading"]')).not.toBeNull();
    expect(document.querySelector('h3[data-cir-part="block-heading"]')).not.toBeNull();
  });

  it('divider renders an <hr>', () => {
    render(<HostedEditor initial={[{ id: 'd', type: 'divider' }]} />);
    expect(document.querySelector('hr[data-cir-part="block-divider"]')).not.toBeNull();
  });

  it('opens the slash menu on `/` keypress in a paragraph', () => {
    render(<HostedEditor initial={[{ id: 'p', type: 'paragraph', content: '' }]} />);
    const para = document.querySelector('[data-cir-part="block-paragraph"]') as HTMLElement;
    expect(para).not.toBeNull();
    para.focus();
    fireEvent.keyDown(para, { key: '/' });
    // BlockMenu becomes visible (data-cir-component appears).
    expect(document.querySelector('[data-cir-component="BlockMenu"]')).not.toBeNull();
  });

  it('does NOT open the slash menu on `/` inside a code block (literal char passes through)', () => {
    render(
      <HostedEditor
        initial={[{ id: 'c', type: 'code', content: '', meta: { language: 'plaintext' } }]}
      />,
    );
    const ta = document.querySelector(
      '[data-cir-part="block-code"] textarea',
    ) as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    ta.focus();
    fireEvent.keyDown(ta, { key: '/' });
    expect(document.querySelector('[data-cir-component="BlockMenu"]')).toBeNull();
  });

  it('inserts a new block of the picked kind below the active block', () => {
    const onChangeSpy = vi.fn();
    render(
      <HostedEditor
        initial={[{ id: 'p1', type: 'paragraph', content: 'first' }]}
        onChangeSpy={onChangeSpy}
      />,
    );
    const para = document.querySelector('[data-cir-part="block-paragraph"]') as HTMLElement;
    para.focus();
    fireEvent.keyDown(para, { key: '/' });
    // Pick the Heading kind via click.
    const headingButton = screen.getByRole('button', { name: /Heading/i });
    fireEvent.click(headingButton);
    expect(onChangeSpy).toHaveBeenCalled();
    const last = onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1]![0] as readonly Block[];
    expect(last.length).toBe(2);
    expect(last[0]?.id).toBe('p1');
    expect(last[1]?.type).toBe('heading');
  });

  it('Enter at end of paragraph creates a new paragraph below', () => {
    const onChangeSpy = vi.fn();
    render(
      <HostedEditor
        initial={[{ id: 'p1', type: 'paragraph', content: 'first' }]}
        onChangeSpy={onChangeSpy}
      />,
    );
    const para = document.querySelector('[data-cir-part="block-paragraph"]') as HTMLElement;
    para.focus();
    fireEvent.keyDown(para, { key: 'Enter' });
    expect(onChangeSpy).toHaveBeenCalled();
    const last = onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1]![0] as readonly Block[];
    expect(last.length).toBe(2);
    expect(last[1]?.type).toBe('paragraph');
  });

  it('Backspace at start of an empty block deletes it', () => {
    const onChangeSpy = vi.fn();
    render(
      <HostedEditor
        initial={[
          { id: 'p1', type: 'paragraph', content: 'keep me' },
          { id: 'p2', type: 'paragraph', content: '' },
        ]}
        onChangeSpy={onChangeSpy}
      />,
    );
    const paragraphs = document.querySelectorAll('[data-cir-part="block-paragraph"]');
    expect(paragraphs.length).toBe(2);
    const empty = paragraphs[1] as HTMLElement;
    empty.focus();
    fireEvent.keyDown(empty, { key: 'Backspace' });
    expect(onChangeSpy).toHaveBeenCalled();
    const last = onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1]![0] as readonly Block[];
    expect(last.length).toBe(1);
    expect(last[0]?.id).toBe('p1');
  });

  it('Backspace does NOT delete a non-empty block', () => {
    const onChangeSpy = vi.fn();
    render(
      <HostedEditor
        initial={[
          { id: 'p1', type: 'paragraph', content: 'keep' },
          { id: 'p2', type: 'paragraph', content: 'still here' },
        ]}
        onChangeSpy={onChangeSpy}
      />,
    );
    const paragraphs = document.querySelectorAll('[data-cir-part="block-paragraph"]');
    const second = paragraphs[1] as HTMLElement;
    second.focus();
    fireEvent.keyDown(second, { key: 'Backspace' });
    // The handler should let the browser handle in-prose deletion, so
    // onChange may or may not fire; what we assert is that the second
    // block is still present.
    const stillTwo = document.querySelectorAll('[data-cir-part="block-paragraph"]');
    expect(stillTwo.length).toBe(2);
  });

  it('ArrowDown / ArrowUp move focus between blocks', () => {
    render(
      <HostedEditor
        initial={[
          { id: 'p1', type: 'paragraph', content: 'one' },
          { id: 'p2', type: 'paragraph', content: 'two' },
          { id: 'p3', type: 'paragraph', content: 'three' },
        ]}
      />,
    );
    const paragraphs = document.querySelectorAll('[data-cir-part="block-paragraph"]');
    const first = paragraphs[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    // Active state moves to second block.
    const rows = document.querySelectorAll('[data-cir-block][data-block-id]');
    const activeIds = Array.from(rows)
      .filter((r) => r.getAttribute('data-active') === 'true')
      .map((r) => r.getAttribute('data-block-id'));
    expect(activeIds).toEqual(['p2']);

    // Now ArrowUp from second.
    const second = paragraphs[1] as HTMLElement;
    fireEvent.keyDown(second, { key: 'ArrowUp' });
    const rowsAfterUp = document.querySelectorAll('[data-cir-block][data-block-id]');
    const activeAfterUp = Array.from(rowsAfterUp)
      .filter((r) => r.getAttribute('data-active') === 'true')
      .map((r) => r.getAttribute('data-block-id'));
    expect(activeAfterUp).toEqual(['p1']);
  });

  it('renders drag handles only when draggable=true', () => {
    const { rerender } = render(
      <HostedEditor initial={[{ id: 'p1', type: 'paragraph', content: 'x' }]} draggable={false} />,
    );
    expect(document.querySelectorAll('[data-cir-part="block-drag-handle"]').length).toBe(0);
    rerender(<HostedEditor initial={[{ id: 'p1', type: 'paragraph', content: 'x' }]} draggable />);
    expect(document.querySelectorAll('[data-cir-part="block-drag-handle"]').length).toBeGreaterThan(
      0,
    );
  });

  it('drag-and-drop reorders blocks', () => {
    const onChangeSpy = vi.fn();
    render(
      <HostedEditor
        draggable
        initial={[
          { id: 'p1', type: 'paragraph', content: 'one' },
          { id: 'p2', type: 'paragraph', content: 'two' },
          { id: 'p3', type: 'paragraph', content: 'three' },
        ]}
        onChangeSpy={onChangeSpy}
      />,
    );
    const handles = document.querySelectorAll('[data-cir-part="block-drag-handle"]');
    expect(handles.length).toBe(3);
    const rows = document.querySelectorAll('[data-cir-block][data-block-id]');
    expect(rows.length).toBe(3);

    // happy-dom DataTransfer mock.
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => {
        data.set(k, v);
      },
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
      dropEffect: '',
    };

    // Drag from p1 → drop on p3.
    fireEvent.dragStart(handles[0]!, { dataTransfer });
    fireEvent.dragOver(rows[2]!, { dataTransfer });
    fireEvent.drop(rows[2]!, { dataTransfer });

    expect(onChangeSpy).toHaveBeenCalled();
    const last = onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1]![0] as readonly Block[];
    // p1 should now be at index 2 (since it was moved past p2 then onto p3).
    expect(last.map((b) => b.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('seeds an empty document with a single paragraph (auto-bootstrap)', () => {
    const onChangeSpy = vi.fn();
    render(<HostedEditor initial={[]} onChangeSpy={onChangeSpy} />);
    expect(onChangeSpy).toHaveBeenCalled();
    const seeded = onChangeSpy.mock.calls[0]![0] as readonly Block[];
    expect(seeded.length).toBe(1);
    expect(seeded[0]?.type).toBe('paragraph');
  });

  it('emits data-cir-component + data-variant + surface attributes', () => {
    render(<HostedEditor initial={[{ id: 'p', type: 'paragraph', content: 'x' }]} />);
    const root = document.querySelector('[data-cir-component="BlockEditor"]');
    expect(root?.getAttribute('data-cir-surface')).toBe('doc');
    expect(root?.getAttribute('data-variant')).toBe('ghost');
  });

  it('binding id matches', () => {
    expect(BlockEditorBinding.id).toBe('BlockEditor');
  });

  it('text-render produces a non-empty fallback string', () => {
    const out = blockEditorTextRender({
      blocks: [
        { id: 'h1', type: 'heading', content: 'Hello', meta: { level: 1 } },
        { id: 'p1', type: 'paragraph', content: 'World' },
        { id: 'd1', type: 'divider' },
      ],
    });
    expect(out).toContain('# Hello');
    expect(out).toContain('World');
    expect(out).toContain('---');
  });

  it('text-render of empty document is the [BlockEditor: empty] sentinel', () => {
    expect(blockEditorTextRender({ blocks: [] })).toBe('[BlockEditor: empty]');
  });
});
