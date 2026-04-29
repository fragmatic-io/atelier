// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard, StatCardBinding } from '../src/components/StatCard.js';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Revenue" value="$1.2M" />);
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('$1.2M')).toBeTruthy();
  });

  it('omits delta and helper text when not provided', () => {
    const { container } = render(<StatCard label="MAU" value={1234} />);
    expect(container.querySelector('[data-cir-part="stat-delta"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="stat-helper"]')).toBeNull();
  });

  it('renders delta with trend data attr', () => {
    const { container } = render(
      <StatCard label="MAU" value={1234} delta={{ value: '+12%', trend: 'up' }} />,
    );
    const delta = container.querySelector('[data-cir-part="stat-delta"]');
    expect(delta).toBeTruthy();
    expect(delta?.getAttribute('data-trend')).toBe('up');
    expect(delta?.textContent).toContain('+12%');
  });

  it('supports down and flat trends', () => {
    const { container, rerender } = render(
      <StatCard label="x" value="0" delta={{ value: '-1', trend: 'down' }} />,
    );
    expect(
      container.querySelector('[data-cir-part="stat-delta"]')?.getAttribute('data-trend'),
    ).toBe('down');
    rerender(<StatCard label="x" value="0" delta={{ value: '0', trend: 'flat' }} />);
    expect(
      container.querySelector('[data-cir-part="stat-delta"]')?.getAttribute('data-trend'),
    ).toBe('flat');
  });

  it('renders helper text', () => {
    render(<StatCard label="MAU" value={1234} helperText="vs last week" />);
    expect(screen.getByText('vs last week')).toBeTruthy();
  });

  it('renders as a <section> with aria-label', () => {
    const { container } = render(<StatCard label="Revenue" value="$1.2M" />);
    const section = container.querySelector('section');
    expect(section).toBeTruthy();
    expect(section?.getAttribute('aria-label')).toBe('Revenue');
  });

  it('binding id matches', () => {
    expect(StatCardBinding.id).toBe('StatCard');
  });
});
