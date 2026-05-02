// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
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
});
