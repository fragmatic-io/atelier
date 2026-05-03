// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BlockMenu, BlockMenuBinding } from '../src/components/BlockMenu.js';
import { ALL_SURFACES, InMemoryBlockKindRegistry, type BlockKind } from '../src/blocks/registry.js';

function makeKind(id: string, overrides: Partial<BlockKind> = {}): BlockKind {
  return {
    id,
    label: overrides.label ?? id,
    insert: overrides.insert ?? ((): void => undefined),
    ...overrides,
  };
}

function makeRegistry(): InMemoryBlockKindRegistry {
  const reg = new InMemoryBlockKindRegistry();
  reg.add(
    makeKind('text.paragraph', {
      label: 'Paragraph',
      description: 'Plain text',
      group: 'Text',
      keywords: ['p', 'plain'],
    }),
    'doc',
  );
  reg.add(
    makeKind('text.heading-1', {
      label: 'Heading 1',
      description: 'Big section title',
      group: 'Text',
      keywords: ['h1', 'title'],
    }),
    'doc',
  );
  reg.add(
    makeKind('media.image', {
      label: 'Image',
      description: 'Insert an image',
      group: 'Media',
      keywords: ['img', 'photo'],
    }),
    'doc',
  );
  reg.add(
    makeKind('media.video', {
      label: 'Video',
      group: 'Media',
    }),
    'doc',
  );
  reg.add(
    makeKind('embed.youtube', {
      label: 'YouTube',
      group: 'Embed',
    }),
    'doc',
  );
  reg.add(makeKind('chat.reply', { label: 'Reply', group: 'Chat' }), 'chat');
  return reg;
}

describe('BlockMenu', () => {
  it('renders nothing when closed', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open={false}
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(document.querySelector('[data-cir-component="BlockMenu"]')).toBeNull();
  });

  it('renders all kinds for the surface when open with empty query', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    // 5 doc-scoped kinds; chat.reply must NOT appear.
    expect(items.length).toBe(5);
    const kindIds = Array.from(items).map((el) => el.getAttribute('data-cir-kind'));
    expect(kindIds).not.toContain('chat.reply');
  });

  it('per-surface filtering — chat surface excludes doc-only kinds', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="chat"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-cir-kind')).toBe('chat.reply');
  });

  it('groups items under their `group` heading in first-seen order', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const groups = document.querySelectorAll('[data-cir-part="block-menu-group"]');
    expect(groups.length).toBe(3);
    expect(groups[0]?.getAttribute('data-group')).toBe('Text');
    expect(groups[1]?.getAttribute('data-group')).toBe('Media');
    expect(groups[2]?.getAttribute('data-group')).toBe('Embed');
  });

  it('fuzzy-matches across label, description, and keywords', () => {
    const reg = makeRegistry();
    const { rerender } = render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    // label hit
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'image' } });
    let items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-cir-kind')).toBe('media.image');

    // keyword hit ("h1" → Heading 1)
    rerender(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'h1' } });
    items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-cir-kind')).toBe('text.heading-1');

    // description hit ("Big section title" → Heading 1 via description)
    rerender(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'big section' } });
    items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-cir-kind')).toBe('text.heading-1');
  });

  it('case-insensitive matching', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'IMAGE' } });
    const items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-cir-kind')).toBe('media.image');
  });

  it('shows the empty message when nothing matches', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz-no-match' } });
    expect(screen.getByText(/No matching blocks/i)).toBeTruthy();
  });

  it('ArrowDown / ArrowUp move the highlight across groups (and wrap)', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const input = screen.getByRole('searchbox');
    let items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items[1]?.getAttribute('data-highlighted')).toBe('true');

    // Cross a group boundary (Text → Media)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items[2]?.getAttribute('data-highlighted')).toBe('true');

    // Walk to the end then verify wrap.
    for (let i = 0; i < 3; i += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items[items.length - 1]?.getAttribute('data-highlighted')).toBe('true');
  });

  it('Enter triggers insert on the highlighted kind and onInsert+onClose', () => {
    const reg = makeRegistry();
    const insertSpy = vi.fn();
    reg.add(
      makeKind('test.tracked', {
        label: 'Tracked',
        group: 'Text',
        insert: insertSpy,
      }),
      'doc',
    );
    const onInsert = vi.fn();
    const onClose = vi.fn();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        position={{ caret: 42 }}
        onInsert={onInsert}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tracked' } });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith({ surface: 'doc', position: { caret: 42 } });
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect((onInsert.mock.calls[0]![0] as BlockKind).id).toBe('test.tracked');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a kind triggers insert + onInsert+onClose with that kind', () => {
    const reg = makeRegistry();
    const onInsert = vi.fn();
    const onClose = vi.fn();
    render(<BlockMenu registry={reg} surface="doc" open onInsert={onInsert} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Image/i }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect((onInsert.mock.calls[0]![0] as BlockKind).id).toBe('media.image');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onClose', () => {
    const reg = makeRegistry();
    const onClose = vi.fn();
    render(
      <BlockMenu registry={reg} surface="doc" open onInsert={() => undefined} onClose={onClose} />,
    );
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab autocompletes a unique group prefix into the input', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const input = screen.getByRole('searchbox');
    // 'me' uniquely prefixes 'Media'.
    fireEvent.change(input, { target: { value: 'me' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.value).toBe('Media');
  });

  it('Tab is a no-op when the prefix is ambiguous', () => {
    const reg = makeRegistry();
    // Add a second group starting with 'M' to make 'm' ambiguous.
    reg.add(makeKind('misc.divider', { label: 'Divider', group: 'Misc' }), 'doc');
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'm' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.value).toBe('m');
  });

  it('subscribes to the registry — adding a kind while open re-renders the list', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    let items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    const before = items.length;
    act(() => {
      reg.add(makeKind('runtime.late', { label: 'Late', group: 'Text' }), 'doc');
    });
    items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items.length).toBe(before + 1);
  });

  it('emits data-cir-component, surface, and trigger attributes', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        trigger="@"
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const root = document.querySelector('[data-cir-component="BlockMenu"]');
    expect(root?.getAttribute('data-cir-surface')).toBe('doc');
    expect(root?.getAttribute('data-cir-trigger')).toBe('@');
  });

  it('binding id matches', () => {
    expect(BlockMenuBinding.id).toBe('BlockMenu');
  });

  it('defaults to variant=default and emits data-variant', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const root = document.querySelector('[data-cir-component="BlockMenu"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });

  it('reflects variant=compact', () => {
    const reg = makeRegistry();
    render(
      <BlockMenu
        registry={reg}
        surface="doc"
        open
        variant="compact"
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const root = document.querySelector('[data-cir-component="BlockMenu"]');
    expect(root?.getAttribute('data-variant')).toBe('compact');
  });

  it('renders kinds bound to ALL_SURFACES regardless of surface', () => {
    const reg = new InMemoryBlockKindRegistry();
    reg.add(makeKind('any.divider', { label: 'Divider' }), ALL_SURFACES);
    render(
      <BlockMenu
        registry={reg}
        surface="anywhere"
        open
        onInsert={() => undefined}
        onClose={() => undefined}
      />,
    );
    const items = document.querySelectorAll('[data-cir-part="block-menu-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-cir-kind')).toBe('any.divider');
  });
});
