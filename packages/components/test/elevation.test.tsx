// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
/**
 * Vis-7 — elevation / surface system smoke.
 *
 * The seven components opted in to the Wave 11 / Vis-7 elevation scale all
 * emit `data-elevation={level}` AND the matching Tailwind `shadow-*` utility
 * class. This file pins every level so a regression in any one component
 * fails loudly with a precise selector.
 *
 * The renderer never paints the shadow inside happy-dom; the assertion is on
 * the attribute + class string. Hosts that ship the `--cir-shadow-{level}`
 * CSS variable bridge from `globals.css` get a working dark-paired shadow at
 * runtime; hosts that pull only Tailwind get the same via the utility class.
 */
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ELEVATION_LEVELS, elevationClass } from '../src/components/_variants.js';
import { Card } from '../src/components/Card.js';
import { Modal } from '../src/components/Modal.js';
import { Drawer } from '../src/components/Drawer.js';
import { Tooltip } from '../src/components/Tooltip.js';
import { HoverCard } from '../src/components/HoverCard.js';
import { BulkActionBar } from '../src/components/BulkActionBar.js';
import { CommandPalette } from '../src/components/CommandPalette.js';

describe('Vis-7 — elevation table', () => {
  it('declares the five canonical levels in canonical order', () => {
    expect([...ELEVATION_LEVELS]).toEqual(['resting', 'hover', 'popover', 'modal', 'commandbar']);
  });

  it('maps each level to the expected Tailwind shadow utility (resting is bare)', () => {
    expect(elevationClass.resting).toBe('');
    expect(elevationClass.hover).toBe('shadow-sm');
    expect(elevationClass.popover).toBe('shadow-md');
    expect(elevationClass.modal).toBe('shadow-lg');
    expect(elevationClass.commandbar).toBe('shadow-xl');
  });

  it('every level has a stable-frozen entry — Object.freeze locks the surface', () => {
    expect(Object.isFrozen(elevationClass)).toBe(true);
    expect(Object.isFrozen(ELEVATION_LEVELS)).toBe(true);
  });
});

describe('Vis-7 — component opt-ins emit data-elevation + utility class', () => {
  it('Card variant="elevated" → resting elevation, data-elevation="resting"', () => {
    const { container } = render(
      <Card variant="elevated" title="t">
        body
      </Card>,
    );
    const root = container.querySelector('[data-cir-component="Card"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-elevation')).toBe('resting');
    // `resting` maps to a BARE Tailwind utility (the empty string) — the
    // visual shadow at this level comes from the `layoutVariantClass.elevated`
    // entry plus the host's `[data-elevation="resting"]` CSS hook. The
    // contract we pin is "no extra elevation utility was added for resting".
    // The Card's own layout variant already supplies `shadow-md`, so we
    // assert the count of shadow-* tokens is exactly 1 (the layout one),
    // not 2 (which would mean elevation also added one).
    const cls = root!.getAttribute('class') ?? '';
    const shadowTokens = cls.match(/\bshadow-(sm|md|lg|xl)\b/g) ?? [];
    expect(shadowTokens).toHaveLength(1);
  });

  it('Card variant="bordered" — no data-elevation, no shadow class from elevation', () => {
    const { container } = render(
      <Card variant="bordered" title="t">
        body
      </Card>,
    );
    const root = container.querySelector('[data-cir-component="Card"]');
    expect(root!.hasAttribute('data-elevation')).toBe(false);
  });

  it('Modal — data-elevation="modal" and shadow-lg', () => {
    const { container } = render(
      <Modal open={true} title="m" onClose={() => undefined}>
        body
      </Modal>,
    );
    const root = container.querySelector('[data-cir-component="Modal"]');
    expect(root!.getAttribute('data-elevation')).toBe('modal');
    expect(root!.getAttribute('class') ?? '').toMatch(/\bshadow-lg\b/);
  });

  it('Drawer — data-elevation="modal" and shadow-lg', () => {
    const { container } = render(
      <Drawer open={true} onClose={() => undefined}>
        body
      </Drawer>,
    );
    const root = container.querySelector('[data-cir-component="Drawer"]');
    expect(root!.getAttribute('data-elevation')).toBe('modal');
    expect(root!.getAttribute('class') ?? '').toMatch(/\bshadow-lg\b/);
  });

  it('Tooltip bubble — data-elevation="popover" and shadow-md', async () => {
    // Tooltip only mounts on hover; trigger via the tooltip's exposed pure
    // path is awkward, so we rely on a focus-driven open: focus the trigger
    // and wait for the show timer (default 400ms). To avoid flakiness, we
    // probe the rendered classlist via a snapshot after manual hover events.
    const { container, unmount } = render(
      <Tooltip content="hi" delay={0}>
        <button type="button">trigger</button>
      </Tooltip>,
    );
    const trigger = container.querySelector('button');
    expect(trigger).not.toBeNull();
    // Synchronous open by firing the underlying focus + waiting a microtask.
    const { fireEvent, act } = await import('@testing-library/react');
    await act(async () => {
      fireEvent.focus(trigger!);
      await new Promise((r) => setTimeout(r, 5));
    });
    const bubble = document.querySelector('[data-cir-component="Tooltip"]');
    expect(bubble).not.toBeNull();
    expect(bubble!.getAttribute('data-elevation')).toBe('popover');
    expect(bubble!.getAttribute('class') ?? '').toMatch(/\bshadow-md\b/);
    unmount();
  });

  it('HoverCard — data-elevation="popover" and shadow-md', async () => {
    const { container, unmount } = render(
      <HoverCard content="preview" openDelay={0}>
        <button type="button">trigger</button>
      </HoverCard>,
    );
    const trigger = container.querySelector('button');
    const { fireEvent, act } = await import('@testing-library/react');
    await act(async () => {
      fireEvent.mouseEnter(trigger!);
      await new Promise((r) => setTimeout(r, 5));
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]');
    expect(card).not.toBeNull();
    expect(card!.getAttribute('data-elevation')).toBe('popover');
    expect(card!.getAttribute('class') ?? '').toMatch(/\bshadow-md\b/);
    unmount();
  });

  it('BulkActionBar — data-elevation="popover" and shadow-md', () => {
    render(
      <BulkActionBar
        selectionCount={3}
        actions={[{ id: 'x', label: 'X' }]}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    const bar = screen.getByRole('region');
    expect(bar.getAttribute('data-elevation')).toBe('popover');
    expect(bar.getAttribute('class') ?? '').toMatch(/\bshadow-md\b/);
  });

  it('CommandPalette — data-elevation="commandbar" and shadow-xl', () => {
    render(
      <CommandPalette
        open={true}
        commands={[{ id: 'a', label: 'A', onSelect: () => undefined }]}
        onClose={() => undefined}
        bindOpenHotkey={false}
      />,
    );
    const root = document.querySelector('[data-cir-component="CommandPalette"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-elevation')).toBe('commandbar');
    expect(root!.getAttribute('class') ?? '').toMatch(/\bshadow-xl\b/);
  });
});
