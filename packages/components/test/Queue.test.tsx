// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Queue, QueueBinding, queueTextRender } from '../src/components/Queue.js';

interface Thread {
  id: string;
  subject: string;
}

const THREE: Thread[] = [
  { id: 't1', subject: 'Renew domain' },
  { id: 't2', subject: 'Approve invoice' },
  { id: 't3', subject: 'Reply to Sam' },
];

describe('Queue', () => {
  it('binding id, role, and action slot are wired', () => {
    expect(QueueBinding.id).toBe('Queue');
    expect(QueueBinding.compositionRole).toBe('list');
    expect(QueueBinding.actionSlots).toEqual(['onAction']);
  });

  it('renders one row per item with the default title-derived label', () => {
    const items = [{ title: 'Alpha' }, { title: 'Beta' }, { title: 'Gamma' }];
    const { container } = render(<Queue items={items} />);
    const rows = container.querySelectorAll('[data-cir-part="queue-row"]');
    expect(rows.length).toBe(3);
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Beta');
  });

  it('reads `data` array when `items` is omitted (manifest binding contract)', () => {
    const { container } = render(
      <Queue data={THREE} renderItem={(t) => <span>{(t as Thread).subject}</span>} />,
    );
    expect(container.querySelectorAll('[data-cir-part="queue-row"]').length).toBe(3);
    expect(container.textContent).toContain('Renew domain');
  });

  it('renders title in a header when supplied', () => {
    render(<Queue items={['x']} title="Decisions" />);
    expect(screen.getByText('Decisions')).toBeTruthy();
  });

  it('renders one button per declared action with capability id on data-action-id', () => {
    render(
      <Queue
        items={THREE}
        actions={[
          { id: 'thread.archive', label: 'Archive', variant: 'destructive' },
          { id: 'task.create_from_thread', label: 'Make task', variant: 'secondary' },
        ]}
        renderItem={(t) => <span>{t.subject}</span>}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // 3 rows * 2 actions = 6 buttons.
    expect(buttons.length).toBe(6);
    const ids = buttons.map((b) => b.getAttribute('data-action-id'));
    expect(ids.filter((id) => id === 'thread.archive').length).toBe(3);
    expect(ids.filter((id) => id === 'task.create_from_thread').length).toBe(3);
  });

  it('dispatches onAction with capability id and item on click', async () => {
    const onAction = vi.fn(async () => {});
    render(
      <Queue
        items={THREE}
        actions={[{ id: 'thread.archive', label: 'Archive' }]}
        onAction={onAction}
        optimisticHide={false}
        renderItem={(t) => <span>{t.subject}</span>}
      />,
    );
    const archiveButtons = screen.getAllByText('Archive');
    fireEvent.click(archiveButtons[1]!);
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith('thread.archive', THREE[1]);
    });
  });

  it('optimistically hides the row after a successful action by default', async () => {
    const onAction = vi.fn(async () => {});
    const { container } = render(
      <Queue
        items={THREE}
        actions={[{ id: 'thread.archive', label: 'Archive' }]}
        onAction={onAction}
        renderItem={(t) => <span>{t.subject}</span>}
      />,
    );
    expect(container.querySelectorAll('[data-cir-part="queue-row"]').length).toBe(3);
    const archiveButtons = screen.getAllByText('Archive');
    fireEvent.click(archiveButtons[0]!);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-cir-part="queue-row"]').length).toBe(2);
    });
  });

  it('does not hide the row on action failure', async () => {
    const onAction = vi.fn(() => {
      return Promise.reject(new Error('Boom'));
    });
    const { container } = render(
      <Queue
        items={THREE}
        actions={[{ id: 'thread.archive', label: 'Archive' }]}
        onAction={onAction}
        renderItem={(t) => <span>{t.subject}</span>}
      />,
    );
    fireEvent.click(screen.getAllByText('Archive')[0]!);
    await waitFor(() => {
      expect(onAction).toHaveBeenCalled();
    });
    expect(container.querySelectorAll('[data-cir-part="queue-row"]').length).toBe(3);
  });

  it('groups items by groupBy and labels via groupLabels in groupOrder', () => {
    interface Task {
      id: string;
      title: string;
      bucket: 'today' | 'later';
    }
    const tasks: Task[] = [
      { id: '1', title: 'Email Sam', bucket: 'today' },
      { id: '2', title: 'Plan trip', bucket: 'later' },
      { id: '3', title: 'Pay bill', bucket: 'today' },
    ];
    const { container } = render(
      <Queue
        items={tasks}
        groupBy={(t) => t.bucket}
        groupLabels={{ today: 'Today', later: 'Later' }}
        groupOrder={['today', 'later']}
      />,
    );
    const groups = container.querySelectorAll('[data-cir-part="queue-group"]');
    expect(groups.length).toBe(2);
    expect(groups[0]?.getAttribute('data-group-key')).toBe('today');
    expect(groups[1]?.getAttribute('data-group-key')).toBe('later');
    const labels = Array.from(
      container.querySelectorAll('[data-cir-part="queue-group-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toEqual(['Today', 'Later']);
  });

  it('honours pinned: true on items by surfacing data-pinned on the row', () => {
    const items = [
      { id: 'a', title: 'Alpha' },
      { id: 'b', title: 'Bravo', pinned: true },
    ];
    const { container } = render(<Queue items={items} />);
    const pinned = container.querySelector('[data-cir-part="queue-row"][data-pinned="true"]');
    expect(pinned).toBeTruthy();
    expect(pinned?.textContent).toContain('Bravo');
  });

  // -- Wave 11 / Nav-3 — sticky pin parity with <List> / <Table> ----------
  describe('pinned items (Nav-3)', () => {
    it('partitions pinned items to the top regardless of source order', () => {
      const items = [
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Bravo', pinned: true },
        { id: 'c', title: 'Charlie' },
      ];
      const { container } = render(<Queue items={items} />);
      const rows = Array.from(container.querySelectorAll('[data-cir-part="queue-row"]'));
      expect(rows[0]?.textContent).toContain('Bravo');
      expect(rows[1]?.textContent).toContain('Alpha');
      expect(rows[2]?.textContent).toContain('Charlie');
    });

    it('renders a pinned-separator when pinned rows exist (default)', () => {
      const items = [
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Bravo', pinned: true },
      ];
      const { container } = render(<Queue items={items} />);
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).not.toBeNull();
    });

    it('omits the separator when showPinnedSeparator={false}', () => {
      const items = [
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Bravo', pinned: true },
      ];
      const { container } = render(<Queue items={items} showPinnedSeparator={false} />);
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).toBeNull();
    });

    it('does not emit a separator when no rows are pinned', () => {
      const items = [
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Bravo' },
      ];
      const { container } = render(<Queue items={items} />);
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).toBeNull();
      expect(
        container.querySelector('[data-cir-component="Queue"]')?.getAttribute('data-has-pinned'),
      ).toBe('false');
    });

    it('applies sticky CSS to pinned rows', () => {
      const items = [{ id: 'b', title: 'Bravo', pinned: true }];
      const { container } = render(<Queue items={items} />);
      const li = container.querySelector<HTMLElement>(
        '[data-cir-part="queue-row"][data-pinned="true"]',
      );
      expect(li?.style.position).toBe('sticky');
      expect(li?.style.top).toBe('0px');
      expect(li?.style.zIndex).toBe('10');
    });

    it('renders a default pin glyph (Unicode pushpin) on pinned rows', () => {
      const items = [{ id: 'b', title: 'Bravo', pinned: true }];
      const { container } = render(<Queue items={items} />);
      const indicator = container.querySelector(
        '[data-cir-part="queue-row"][data-pinned="true"] [data-pin-indicator="true"]',
      );
      expect(indicator).not.toBeNull();
      expect(indicator?.textContent ?? '').toContain('\u{1F4CC}');
    });

    it('honours pinIcon={null} (no glyph at all)', () => {
      const items = [{ id: 'b', title: 'Bravo', pinned: true }];
      const { container } = render(<Queue items={items} pinIcon={null} />);
      // Row still pinned + sticky, but no indicator span.
      expect(container.querySelector('[data-pinned="true"]')).not.toBeNull();
      expect(container.querySelector('[data-pin-indicator="true"]')).toBeNull();
    });

    it('honours pinIcon as IconRef (renders <Icon> via the resolver)', () => {
      const items = [{ id: 'b', title: 'Bravo', pinned: true }];
      const { container } = render(<Queue items={items} pinIcon="pin" />);
      const indicator = container.querySelector('[data-pin-indicator="true"]');
      expect(indicator).not.toBeNull();
      // Default resolver produces a missing-icon placeholder marker.
      expect(indicator?.querySelector('[data-cir-component="Icon"]')).not.toBeNull();
      expect(indicator?.querySelector('[data-icon-name="pin"]')).not.toBeNull();
    });

    it('uses pinAriaLabel callback for the aria-label on pinned rows', () => {
      const items = [{ id: 'b', title: 'Bravo', pinned: true }];
      const { container } = render(
        <Queue items={items} pinAriaLabel={(it) => `Pinned: ${(it as { title: string }).title}`} />,
      );
      expect(
        container
          .querySelector('[data-cir-part="queue-row"][data-pinned="true"]')
          ?.getAttribute('aria-label'),
      ).toBe('Pinned: Bravo');
    });

    it('defaults pinned aria-label to "Pinned"', () => {
      const items = [{ id: 'b', title: 'Bravo', pinned: true }];
      const { container } = render(<Queue items={items} />);
      expect(
        container
          .querySelector('[data-cir-part="queue-row"][data-pinned="true"]')
          ?.getAttribute('aria-label'),
      ).toBe('Pinned');
    });

    it('emits data-cir-density on the pinned section so hosts can target compact', () => {
      const items = [{ id: 'b', title: 'Bravo', pinned: true }];
      const { container } = render(<Queue items={items} density="compact" />);
      const group = container.querySelector('[data-cir-part="queue-group"]');
      expect(group?.getAttribute('data-cir-density')).toBe('compact');
    });
  });

  it('surfaces per-item `emphasis` as data-emphasis on the row (mirrors pinned)', () => {
    // Marketplace-pivot affordance: rows opt into a salience tag via an
    // `emphasis` field on the item, the same shape `pinned` uses. The data
    // resolver / manifest decides which rows carry the flag — Queue stays
    // agnostic. Replaces the per-host `<IssueQueue emphasizeTopN={3}>`
    // pattern that drove the Octant→Queue migration.
    const items = [
      { id: 'a', title: 'Alpha', emphasis: 'hero' },
      { id: 'b', title: 'Bravo', emphasis: 'hero' },
      { id: 'c', title: 'Charlie' },
    ];
    const { container } = render(<Queue items={items} />);
    const heroes = container.querySelectorAll('[data-cir-part="queue-row"][data-emphasis="hero"]');
    expect(heroes.length).toBe(2);
    expect(heroes[0]?.textContent).toContain('Alpha');
    const plain = container.querySelectorAll('[data-cir-part="queue-row"]:not([data-emphasis])');
    expect(plain.length).toBe(1);
    expect(plain[0]?.textContent).toContain('Charlie');
  });

  it('disables action buttons during the in-flight action', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onAction = vi.fn(async () => pending);
    render(
      <Queue
        items={THREE}
        actions={[{ id: 'thread.archive', label: 'Archive' }]}
        onAction={onAction}
        optimisticHide={false}
        renderItem={(t) => <span>{t.subject}</span>}
      />,
    );
    const buttons = screen.getAllByText('Archive');
    fireEvent.click(buttons[0]!);
    await waitFor(() => {
      expect(buttons[0]!.disabled).toBe(true);
    });
    resolve();
  });

  it('text-render returns count and title', () => {
    expect(queueTextRender({ items: THREE, title: 'Decisions' })).toBe(
      '[Queue: Decisions: 3 items]',
    );
    expect(queueTextRender({ data: [1, 2] })).toBe('[Queue: 2 items]');
    expect(queueTextRender({})).toBe('[Queue: 0 items]');
  });

  it('idOf override threads through to row keys (uses index fallback when omitted)', () => {
    // Repeated content with no `id` field — default idOf falls back to index.
    const items = [{ subject: 'dup' }, { subject: 'dup' }];
    const { container } = render(
      <Queue items={items} renderItem={(t) => <span>{t.subject}</span>} />,
    );
    expect(container.querySelectorAll('[data-cir-part="queue-row"]').length).toBe(2);
  });

  it('confirmInline toggles button label and only dispatches on the second click', async () => {
    const onAction = vi.fn(async () => {});
    render(
      <Queue
        items={[{ id: 't1', title: 'Renew domain' }]}
        actions={[{ id: 'thread.archive', label: 'Archive', confirmInline: 'Confirm?' }]}
        onAction={onAction}
        optimisticHide={false}
      />,
    );
    const btn = screen.getByText('Archive');
    fireEvent.click(btn);
    expect(screen.getByText('Confirm?')).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm?'));
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith('thread.archive', { id: 't1', title: 'Renew domain' });
    });
  });

  // -- Wave 11 / Int-9 — multi-select + bulk-action bar --------------------

  describe('multi-select', () => {
    it('renders a leading checkbox per row when `selectable` is true', () => {
      const { container } = render(<Queue items={THREE} selectable />);
      const checkboxes = container.querySelectorAll('[data-cir-part="queue-checkbox"]');
      expect(checkboxes.length).toBe(3);
      expect(
        container.querySelector('[data-cir-component="Queue"]')?.getAttribute('data-selectable'),
      ).toBe('true');
    });

    it('does NOT render checkboxes when `selectable` is false (backwards compat)', () => {
      const { container } = render(<Queue items={THREE} />);
      expect(container.querySelectorAll('[data-cir-part="queue-checkbox"]').length).toBe(0);
    });

    it('click toggles selection via onSelectionChange', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>()}
          onSelectionChange={onSelectionChange}
        />,
      );
      const cbs = container.querySelectorAll<HTMLInputElement>('[data-cir-part="queue-checkbox"]');
      fireEvent.click(cbs[1]!);
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const next = onSelectionChange.mock.calls[0]![0] as ReadonlySet<string>;
      expect(Array.from(next)).toEqual(['t2']);
    });

    it('Shift+Click range-selects between the last anchor and the new row', () => {
      const onSelectionChange = vi.fn();
      const { container, rerender } = render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>()}
          onSelectionChange={onSelectionChange}
        />,
      );
      const cbs = (): NodeListOf<HTMLInputElement> =>
        container.querySelectorAll<HTMLInputElement>('[data-cir-part="queue-checkbox"]');
      // First click — set anchor at index 0.
      fireEvent.click(cbs()[0]!);
      const afterFirst = onSelectionChange.mock.calls[0]![0] as ReadonlySet<string>;
      expect(Array.from(afterFirst)).toEqual(['t1']);
      // Re-render with the resulting selection so Shift+Click sees a non-empty
      // controlled set.
      rerender(
        <Queue
          items={THREE}
          selectable
          selectedIds={afterFirst}
          onSelectionChange={onSelectionChange}
        />,
      );
      // Shift+Click on index 2 — should select rows 0..2 inclusive.
      fireEvent.click(cbs()[2]!, { shiftKey: true });
      const afterShift = onSelectionChange.mock.calls[1]![0] as ReadonlySet<string>;
      expect(new Set(Array.from(afterShift))).toEqual(new Set(['t1', 't2', 't3']));
    });

    it('auto-mounts <BulkActionBar> when bulkActions are declared and selection non-empty', () => {
      render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>(['t2'])}
          bulkActions={[{ id: 'thread.bulk_archive', label: 'Archive' }]}
        />,
      );
      const bar = document.body.querySelector('[data-cir-component="BulkActionBar"]');
      expect(bar).not.toBeNull();
      expect(bar?.textContent ?? '').toContain('1 selected');
    });

    it('does NOT mount the bar when selection is empty', () => {
      render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>()}
          bulkActions={[{ id: 'thread.bulk_archive', label: 'Archive' }]}
        />,
      );
      expect(document.body.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
    });

    it('bulk-action click fires onBulkAction with the action id', () => {
      const onBulkAction = vi.fn();
      render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>(['t1', 't2'])}
          bulkActions={[
            { id: 'thread.bulk_archive', label: 'Archive' },
            { id: 'thread.bulk_delete', label: 'Delete', variant: 'destructive' },
          ]}
          onBulkAction={onBulkAction}
        />,
      );
      const archiveBtn = document.body.querySelector<HTMLButtonElement>(
        '[data-action-id="thread.bulk_archive"]',
      );
      expect(archiveBtn).not.toBeNull();
      fireEvent.click(archiveBtn!);
      expect(onBulkAction).toHaveBeenCalledWith('thread.bulk_archive');
    });

    it('Esc clears the selection (uses BulkActionBar fallback keydown listener)', () => {
      const onSelectionChange = vi.fn();
      render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>(['t1', 't2'])}
          onSelectionChange={onSelectionChange}
          bulkActions={[{ id: 'thread.bulk_archive', label: 'Archive' }]}
        />,
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onSelectionChange).toHaveBeenCalled();
      const last = onSelectionChange.mock.calls.at(-1)![0] as ReadonlySet<string>;
      expect(last.size).toBe(0);
    });

    it('close (×) button on the bar clears the selection', () => {
      const onSelectionChange = vi.fn();
      render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>(['t1'])}
          onSelectionChange={onSelectionChange}
          bulkActions={[{ id: 'thread.bulk_archive', label: 'Archive' }]}
        />,
      );
      const close = document.body.querySelector<HTMLButtonElement>('[data-cir-part="bulk-close"]');
      fireEvent.click(close!);
      const last = onSelectionChange.mock.calls.at(-1)![0] as ReadonlySet<string>;
      expect(last.size).toBe(0);
    });

    it('optimistic-hide drops the dismissed row from the selection set', async () => {
      const onSelectionChange = vi.fn();
      const onAction = vi.fn(async () => {});
      const { container } = render(
        <Queue
          items={THREE}
          selectable
          selectedIds={new Set<string>(['t1', 't2'])}
          onSelectionChange={onSelectionChange}
          actions={[{ id: 'thread.archive', label: 'Archive' }]}
          onAction={onAction}
          renderItem={(t) => <span>{t.subject}</span>}
        />,
      );
      // Per-row archive on the first (selected) row should hide the row AND
      // drop t1 from the selection so the bar count stays coherent.
      const archiveBtns = container.querySelectorAll<HTMLButtonElement>(
        '[data-cir-part="queue-action"]',
      );
      fireEvent.click(archiveBtns[0]!);
      await waitFor(() => {
        expect(onAction).toHaveBeenCalledWith('thread.archive', THREE[0]);
      });
      // The dropped id should no longer be in the most-recent selection.
      const last = onSelectionChange.mock.calls.at(-1)![0] as ReadonlySet<string>;
      expect(last.has('t1')).toBe(false);
      expect(last.has('t2')).toBe(true);
    });

    it('uncontrolled mode (no selectedIds) tracks selection internally', () => {
      const { container } = render(
        <Queue
          items={THREE}
          selectable
          bulkActions={[{ id: 'thread.bulk_archive', label: 'Archive' }]}
        />,
      );
      const cbs = container.querySelectorAll<HTMLInputElement>('[data-cir-part="queue-checkbox"]');
      // Initially no bar — selection empty.
      expect(document.body.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
      fireEvent.click(cbs[0]!);
      // After click, the local-state path should mount the bar.
      expect(document.body.querySelector('[data-cir-component="BulkActionBar"]')).not.toBeNull();
    });
  });
});
