// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@atelier/keyboard';
import {
  BulkActionBar,
  BulkActionBarBinding,
  bulkActionBarTextRender,
  type BulkAction,
} from '../src/components/BulkActionBar.js';
import { KeyboardProvider } from '../src/keyboard/index.js';

const sampleActions: readonly BulkAction[] = [
  { id: 'github.issue.bulk_close', label: 'Close', confirmation: 'modal' },
  { id: 'github.issue.bulk_archive', label: 'Archive' },
  { id: 'github.issue.bulk_delete', label: 'Delete', variant: 'destructive' },
];

describe('BulkActionBar', () => {
  it('renders nothing when selectionCount is 0', () => {
    const { container } = render(
      <BulkActionBar
        selectionCount={0}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(container.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
  });

  it('renders when selectionCount >= 1', () => {
    render(
      <BulkActionBar
        selectionCount={2}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(document.querySelector('[data-cir-component="BulkActionBar"]')).not.toBeNull();
  });

  it('shows the selection count pill', () => {
    render(
      <BulkActionBar
        selectionCount={5}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(screen.getByText('5 selected')).toBeTruthy();
  });

  it('renders one button per action and forwards click to onAction', () => {
    const onAction = vi.fn();
    render(
      <BulkActionBar
        selectionCount={3}
        actions={sampleActions}
        onAction={onAction}
        onClear={() => undefined}
      />,
    );
    const closeBtn = document.querySelector<HTMLButtonElement>(
      '[data-action-id="github.issue.bulk_close"]',
    );
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);
    expect(onAction).toHaveBeenCalledWith('github.issue.bulk_close');
  });

  it('Esc key calls onClear', () => {
    const onClear = vi.fn();
    render(
      <BulkActionBar
        selectionCount={2}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={onClear}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClear).toHaveBeenCalled();
  });

  it('close (×) button calls onClear', () => {
    const onClear = vi.fn();
    render(
      <BulkActionBar
        selectionCount={1}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={onClear}
      />,
    );
    const closeBtn = document.querySelector<HTMLButtonElement>('[data-cir-part="bulk-close"]');
    fireEvent.click(closeBtn!);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('destructive action receives a red utility class', () => {
    render(
      <BulkActionBar
        selectionCount={1}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    const deleteBtn = document.querySelector<HTMLButtonElement>(
      '[data-action-id="github.issue.bulk_delete"]',
    );
    expect(deleteBtn?.className ?? '').toContain('bg-red-600');
    expect(deleteBtn?.getAttribute('data-variant')).toBe('destructive');
  });

  it('singular vs plural in aria-label', () => {
    const { unmount } = render(
      <BulkActionBar
        selectionCount={1}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    const single = document.querySelector('[data-cir-component="BulkActionBar"]');
    expect(single?.getAttribute('aria-label')).toContain('1 item selected');
    unmount();
    render(
      <BulkActionBar
        selectionCount={4}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    const plural = document.querySelector('[data-cir-component="BulkActionBar"]');
    expect(plural?.getAttribute('aria-label')).toContain('4 items selected');
  });

  it('renders with role="region" and labelled aria-label', () => {
    render(
      <BulkActionBar
        selectionCount={2}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    const region = document.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toMatch(/Bulk action bar/);
  });

  it('honours prefers-reduced-motion (no transition style)', () => {
    const original = window.matchMedia;
    window.matchMedia = (q: string) =>
      ({
        matches: q.includes('reduce'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        media: q,
      }) as unknown as MediaQueryList;
    render(
      <BulkActionBar
        selectionCount={2}
        actions={sampleActions}
        onAction={() => undefined}
        onClear={() => undefined}
      />,
    );
    const bar = document.querySelector<HTMLElement>('[data-cir-component="BulkActionBar"]');
    expect(bar?.getAttribute('data-reduce-motion')).toBe('true');
    expect(bar?.style.transition ?? '').toBe('');
    window.matchMedia = original;
  });

  it('renders into document.body via portal (escapes its parent)', () => {
    const { container } = render(
      <div data-test-parent>
        <BulkActionBar
          selectionCount={1}
          actions={sampleActions}
          onAction={() => undefined}
          onClear={() => undefined}
        />
      </div>,
    );
    // The bar should NOT be inside the test parent — it escapes via portal.
    expect(container.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
    // It IS in the document body, however.
    expect(document.body.querySelector('[data-cir-component="BulkActionBar"]')).not.toBeNull();
  });

  it('binding id matches', () => {
    expect(BulkActionBarBinding.id).toBe('BulkActionBar');
  });

  it('text-render returns a count summary with action labels', () => {
    expect(
      bulkActionBarTextRender({
        selectionCount: 3,
        actions: [
          { id: 'a', label: 'Archive' },
          { id: 'b', label: 'Delete' },
        ],
        onAction: () => undefined,
        onClear: () => undefined,
      }),
    ).toBe('[BulkActionBar: 3 items selected — Archive, Delete]');
  });

  it('text-render is null-safe with partial props', () => {
    expect(bulkActionBarTextRender({})).toBe('[BulkActionBar: idle]');
    expect(bulkActionBarTextRender({ selectionCount: 1 })).toBe('[BulkActionBar: 1 item selected]');
  });

  // -- Wave 11 / Int-9 + Int-3 — KeyboardProvider integration --------------

  describe('KeyboardProvider integration', () => {
    function makeServices(): KeyboardServices {
      return {
        registry: new InMemoryKeyboardRegistry(),
        recency: new InMemoryRecencyTracker(),
      };
    }

    it('registers a `bulk.clear` action with the registry while visible', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <BulkActionBar
            selectionCount={2}
            actions={sampleActions}
            onAction={() => undefined}
            onClear={() => undefined}
          />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'bulk.clear');
      expect(action).toBeDefined();
      expect(action?.hotkey).toBe('Escape');
    });

    it('does NOT register the action when the bar is hidden (selectionCount === 0)', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <BulkActionBar
            selectionCount={0}
            actions={sampleActions}
            onAction={() => undefined}
            onClear={() => undefined}
          />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'bulk.clear');
      expect(action).toBeUndefined();
    });

    it('invoking `bulk.clear` from the registry calls onClear', () => {
      const services = makeServices();
      const onClear = vi.fn();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <BulkActionBar
            selectionCount={3}
            actions={sampleActions}
            onAction={() => undefined}
            onClear={onClear}
          />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'bulk.clear');
      // The invoke result may be `void | Promise<void>`; we don't care about
      // the return — we only care that `onClear` ran synchronously.
      void action?.invoke();
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('unregisters when the bar unmounts', () => {
      const services = makeServices();
      const { unmount } = render(
        <KeyboardProvider services={services} disableEventListener>
          <BulkActionBar
            selectionCount={1}
            actions={sampleActions}
            onAction={() => undefined}
            onClear={() => undefined}
          />
        </KeyboardProvider>,
      );
      expect(services.registry.list().some((a) => a.id === 'bulk.clear')).toBe(true);
      unmount();
      expect(services.registry.list().some((a) => a.id === 'bulk.clear')).toBe(false);
    });
  });
});
