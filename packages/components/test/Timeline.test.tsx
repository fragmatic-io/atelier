// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline, TimelineBinding, timelineTextRender } from '../src/components/Timeline.js';

const ENTRIES = [
  { id: '1', date: '2026-01-01', title: 'Kickoff', status: 'past' as const },
  {
    id: '2',
    date: '2026-02-15',
    title: 'Phase 2',
    body: <p>body-2</p>,
    status: 'current' as const,
  },
  { id: '3', date: '2026-03-30', title: 'Launch', status: 'future' as const },
];

describe('Timeline', () => {
  it('renders an <ol> with one <li> per entry', () => {
    const { container } = render(<Timeline entries={ENTRIES} />);
    expect(container.querySelector('ol[data-cir-component="Timeline"]')).toBeTruthy();
    expect(container.querySelectorAll('li[data-cir-part="timeline-entry"]').length).toBe(3);
  });

  it('renders the date inside a <time> element', () => {
    const { container } = render(<Timeline entries={ENTRIES} />);
    const times = container.querySelectorAll('time');
    expect(times.length).toBe(3);
    expect(times[0]?.textContent).toBe('2026-01-01');
  });

  it('renders titles and body content', () => {
    render(<Timeline entries={ENTRIES} />);
    expect(screen.getByText('Kickoff')).toBeTruthy();
    expect(screen.getByText('body-2')).toBeTruthy();
  });

  it('marks the current entry with aria-current="step"', () => {
    const { container } = render(<Timeline entries={ENTRIES} />);
    const items = container.querySelectorAll('li[data-cir-part="timeline-entry"]');
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('mirrors status as data-status, defaulting to past', () => {
    const { container } = render(
      <Timeline entries={[{ id: 'x', date: '2026-04-01', title: 'No status' }]} />,
    );
    const li = container.querySelector('li[data-cir-part="timeline-entry"]');
    expect(li?.getAttribute('data-status')).toBe('past');
  });

  it('text-render reports entry count', () => {
    expect(timelineTextRender({ entries: ENTRIES })).toBe('[Timeline: 3 entries]');
  });

  it('binding id matches', () => {
    expect(TimelineBinding.id).toBe('Timeline');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<Timeline entries={ENTRIES} />);
    const root = container.querySelector('[data-cir-component="Timeline"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
    expect(root?.className).toContain('gap-3');
  });
  it('reflects variant=compact class', () => {
    const { container } = render(<Timeline entries={ENTRIES} variant="compact" />);
    const root = container.querySelector('[data-cir-component="Timeline"]');
    expect(root?.className).toContain('gap-1');
  });
  it('reflects variant=sparse class', () => {
    const { container } = render(<Timeline entries={ENTRIES} variant="sparse" />);
    const root = container.querySelector('[data-cir-component="Timeline"]');
    expect(root?.getAttribute('data-variant')).toBe('sparse');
    expect(root?.className).toContain('gap-6');
  });
});
