// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ActivityFeed,
  ActivityFeedBinding,
  activityFeedTextRender,
  groupAdjacentEvents,
  LOAD_MORE_THRESHOLD_PX,
  type ActivityEvent,
} from '../src/components/ActivityFeed.js';

const ALICE = { id: 'u1', name: 'Alice' };

const EVENTS: readonly ActivityEvent[] = [
  {
    id: 'e1',
    type: 'status_changed',
    label: 'changed status to In Progress',
    actor: ALICE,
    timestamp: '2026-05-01T12:00:00Z',
    diff: [
      { kind: 'remove' as const, line: 'todo', oldNumber: 1 },
      { kind: 'add' as const, line: 'in_progress', newNumber: 1 },
    ],
  },
  {
    id: 'e2',
    type: 'label_added',
    label: 'added label "bug"',
    actor: { id: 'u2', name: 'Bob' },
    timestamp: '2026-05-01T12:05:00Z',
    payload: { label: 'bug', color: 'red' },
  },
];

describe('ActivityFeed', () => {
  it('renders events with actor + timestamp', () => {
    const { container } = render(<ActivityFeed events={EVENTS} />);
    expect(container.querySelector('[data-cir-component="ActivityFeed"]')).toBeTruthy();
    const rows = container.querySelectorAll('[data-cir-part="activity-row"]');
    expect(rows.length).toBe(2);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('changed status to In Progress')).toBeTruthy();
    const times = container.querySelectorAll('time[data-cir-part="activity-timestamp"]');
    expect(times[0]?.getAttribute('datetime')).toBe('2026-05-01T12:00:00Z');
    expect(times[0]?.textContent).toBe('2026-05-01T12:00:00Z');
  });

  it('renders an avatar fallback when no avatarUrl is supplied', () => {
    const { container } = render(<ActivityFeed events={EVENTS} />);
    const fallback = container.querySelector('[data-cir-part="activity-avatar-fallback"]');
    expect(fallback?.textContent).toBe('A');
  });

  it('diff toggle expands DiffView', () => {
    const { container } = render(<ActivityFeed events={EVENTS} />);
    // Diff body is collapsed by default.
    expect(container.querySelector('[data-cir-component="DiffView"]')).toBeNull();
    const toggle = container.querySelector('[data-cir-part="activity-diff-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toBe('View diff');
    fireEvent.click(toggle!);
    expect(container.querySelector('[data-cir-component="DiffView"]')).toBeTruthy();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.textContent).toBe('Hide diff');
    // Verify DiffView rendered the supplied hunks.
    const diffRows = container.querySelectorAll('[data-cir-part="diff-row"]');
    expect(diffRows.length).toBe(2);
  });

  it('expandDiffsByDefault flips the initial diff state', () => {
    const { container } = render(<ActivityFeed events={EVENTS} expandDiffsByDefault />);
    expect(container.querySelector('[data-cir-component="DiffView"]')).toBeTruthy();
    const toggle = container.querySelector('[data-cir-part="activity-diff-toggle"]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  });

  it('payload toggle expands JSON', () => {
    const { container } = render(<ActivityFeed events={EVENTS} />);
    expect(container.querySelector('[data-cir-part="activity-payload-body"]')).toBeNull();
    // Second event carries the payload — find its toggle.
    const toggle = container.querySelectorAll('[data-cir-part="activity-payload-toggle"]')[0] as
      | HTMLButtonElement
      | undefined;
    expect(toggle).toBeTruthy();
    expect(toggle?.textContent).toBe('Show payload');
    fireEvent.click(toggle!);
    const body = container.querySelector('[data-cir-part="activity-payload-body"]');
    expect(body).toBeTruthy();
    expect(body?.textContent).toContain('"label": "bug"');
    expect(body?.textContent).toContain('"color": "red"');
    expect(toggle?.textContent).toBe('Hide payload');
  });

  it('groups adjacent events with the same group key', () => {
    const grouped: readonly ActivityEvent[] = [
      {
        id: 'g1',
        type: 'status_changed',
        label: 'changed status',
        timestamp: '2026-05-01T12:00:00Z',
        group: 'status',
      },
      {
        id: 'g2',
        type: 'status_changed',
        label: 'changed status',
        timestamp: '2026-05-01T12:01:00Z',
        group: 'status',
      },
      {
        id: 'g3',
        type: 'status_changed',
        label: 'changed status',
        timestamp: '2026-05-01T12:02:00Z',
        group: 'status',
      },
      {
        id: 'g4',
        type: 'comment_added',
        label: 'commented',
        timestamp: '2026-05-01T12:03:00Z',
      },
    ];
    const { container } = render(<ActivityFeed events={grouped} />);
    const groups = container.querySelectorAll('[data-cir-part="activity-group"]');
    expect(groups.length).toBe(2);
    expect(groups[0]?.getAttribute('data-group-size')).toBe('3');
    expect(groups[0]?.getAttribute('data-group-key')).toBe('status');
    expect(groups[1]?.getAttribute('data-group-size')).toBe('1');
    // Head row carries the count suffix.
    const suffix = groups[0]?.querySelector('[data-cir-part="activity-group-count"]');
    expect(suffix?.textContent).toBe(' (3 times)');
    // Tail rows render under a nested list.
    const tail = groups[0]?.querySelector('[data-cir-part="activity-group-tail"]');
    expect(tail?.querySelectorAll('[data-cir-part="activity-row"]').length).toBe(2);
  });

  it('groupAdjacentEvents does not collapse non-adjacent shared keys', () => {
    const events: readonly ActivityEvent[] = [
      { id: 'a', type: 't', label: 'a', timestamp: '2026-05-01T00:00:00Z', group: 'k' },
      { id: 'b', type: 't', label: 'b', timestamp: '2026-05-01T00:01:00Z', group: 'other' },
      { id: 'c', type: 't', label: 'c', timestamp: '2026-05-01T00:02:00Z', group: 'k' },
    ];
    const buckets = groupAdjacentEvents(events);
    expect(buckets.length).toBe(3);
  });

  it('onLoadMore fires when scrolled within threshold of the bottom', async () => {
    const onLoadMore = vi.fn(() => Promise.resolve());
    const { container } = render(<ActivityFeed events={EVENTS} onLoadMore={onLoadMore} />);
    const root = container.querySelector('[data-cir-component="ActivityFeed"]');
    expect(root).toBeTruthy();

    // Stub geometry so the scroll handler sees us at the bottom edge.
    Object.defineProperty(root!, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(root!, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(root!, 'scrollTop', {
      value: 1000 - 800 - LOAD_MORE_THRESHOLD_PX + 1,
      configurable: true,
    });

    fireEvent.scroll(root!);
    // Resolve the in-flight microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // A second scroll while the in-flight resolves — but we already awaited
    // both microtasks, so the in-flight ref is reset; another scroll past
    // the threshold should fire again.
    fireEvent.scroll(root!);
    await Promise.resolve();
    await Promise.resolve();
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('onLoadMore does NOT fire when scroll is far from the bottom', () => {
    const onLoadMore = vi.fn(() => Promise.resolve());
    const { container } = render(<ActivityFeed events={EVENTS} onLoadMore={onLoadMore} />);
    const root = container.querySelector('[data-cir-component="ActivityFeed"]');
    Object.defineProperty(root!, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(root!, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(root!, 'scrollTop', { value: 100, configurable: true });
    fireEvent.scroll(root!);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('text-render reports event count', () => {
    expect(activityFeedTextRender({ events: EVENTS })).toBe('[ActivityFeed: 2 events]');
  });

  it('binding id matches', () => {
    expect(ActivityFeedBinding.id).toBe('ActivityFeed');
  });

  it('reflects variant via data-variant + class', () => {
    const { container } = render(<ActivityFeed events={EVENTS} variant="compact" />);
    const root = container.querySelector('[data-cir-component="ActivityFeed"]');
    expect(root?.getAttribute('data-variant')).toBe('compact');
    expect(root?.className).toContain('gap-1');
  });
});
