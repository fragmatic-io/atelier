// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  TourProgress,
  TourProgressBinding,
  tourProgressTextRender,
} from '../src/components/TourProgress.js';

const ROOT = '[data-cir-component="TourProgress"]';

describe('TourProgress', () => {
  it('binding id matches', () => {
    expect(TourProgressBinding.id).toBe('TourProgress');
  });

  it('defaults to the dots variant', () => {
    const { container } = render(<TourProgress current={2} total={4} />);
    const root = container.querySelector(ROOT);
    expect(root?.getAttribute('data-variant')).toBe('dots');
  });

  it('renders one dot per step in the dots variant, with the active dot tagged', () => {
    const { container } = render(<TourProgress current={2} total={4} variant="dots" />);
    const dots = container.querySelectorAll('[data-cir-part="tour-progress-dot"]');
    expect(dots.length).toBe(4);
    expect(dots[0]?.getAttribute('data-state')).toBe('done');
    expect(dots[1]?.getAttribute('data-state')).toBe('active');
    expect(dots[2]?.getAttribute('data-state')).toBe('pending');
    expect(dots[3]?.getAttribute('data-state')).toBe('pending');
  });

  it('exposes step / total on data attributes and aria-label', () => {
    const { container } = render(<TourProgress current={3} total={5} variant="dots" />);
    const root = container.querySelector(ROOT);
    expect(root?.getAttribute('data-current')).toBe('3');
    expect(root?.getAttribute('data-total')).toBe('5');
    expect(root?.getAttribute('aria-label')).toBe('Step 3 of 5');
  });

  it('renders distinct DOM for the bar variant — progressbar role + track/fill parts', () => {
    const { container } = render(<TourProgress current={2} total={4} variant="bar" />);
    const root = container.querySelector(ROOT);
    expect(root?.getAttribute('data-variant')).toBe('bar');
    expect(root?.getAttribute('role')).toBe('progressbar');
    expect(root?.getAttribute('aria-valuemin')).toBe('1');
    expect(root?.getAttribute('aria-valuemax')).toBe('4');
    expect(root?.getAttribute('aria-valuenow')).toBe('2');
    expect(container.querySelector('[data-cir-part="tour-progress-track"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-part="tour-progress-fill"]')).toBeTruthy();
    // Bar variant must NOT emit dots.
    expect(container.querySelector('[data-cir-part="tour-progress-dot"]')).toBeNull();
  });

  it('renders distinct DOM for the fraction variant — plain "N / M" text, no dots, no bar', () => {
    const { container } = render(<TourProgress current={3} total={5} variant="fraction" />);
    const root = container.querySelector(ROOT);
    expect(root?.getAttribute('data-variant')).toBe('fraction');
    expect(root?.textContent).toBe('3 / 5');
    expect(container.querySelector('[data-cir-part="tour-progress-dot"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="tour-progress-track"]')).toBeNull();
  });

  it('clamps current into [1, total]', () => {
    const overflow = render(<TourProgress current={9} total={3} variant="dots" />);
    expect(overflow.container.querySelector(ROOT)?.getAttribute('data-current')).toBe('3');
    overflow.unmount();
    const underflow = render(<TourProgress current={0} total={3} variant="dots" />);
    expect(underflow.container.querySelector(ROOT)?.getAttribute('data-current')).toBe('1');
    underflow.unmount();
    const negative = render(<TourProgress current={-5} total={3} variant="dots" />);
    expect(negative.container.querySelector(ROOT)?.getAttribute('data-current')).toBe('1');
  });

  it('coerces total < 1 to 1 (host bug-tolerance)', () => {
    const { container } = render(<TourProgress current={1} total={0} variant="dots" />);
    expect(container.querySelector(ROOT)?.getAttribute('data-total')).toBe('1');
    expect(container.querySelectorAll('[data-cir-part="tour-progress-dot"]').length).toBe(1);
  });

  it('text renderer surfaces the count', () => {
    expect(tourProgressTextRender({ current: 2, total: 5 })).toBe('[TourProgress: 2 / 5]');
    expect(tourProgressTextRender({ current: 0, total: 0 })).toBe('[TourProgress]');
  });

  it('forwards className', () => {
    const { container } = render(<TourProgress current={1} total={3} className="custom-class" />);
    expect(container.querySelector(ROOT)?.className).toContain('custom-class');
  });
});
