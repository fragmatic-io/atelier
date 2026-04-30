// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chart, ChartBinding, chartTextRender } from '../src/components/Chart.js';

const DATA = [
  { x: 'Mon', y: 3 },
  { x: 'Tue', y: 8 },
  { x: 'Wed', y: 5 },
  { x: 'Thu', y: 11 },
  { x: 'Fri', y: 7 },
];

describe('Chart', () => {
  it('renders an svg with the required aria-label', () => {
    const { container } = render(<Chart kind="line" data={DATA} ariaLabel="Weekly visits" />);
    const svg = container.querySelector('svg[data-cir-component="Chart"]');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-label')).toBe('Weekly visits');
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('renders a polyline for kind="line"', () => {
    const { container } = render(<Chart kind="line" data={DATA} ariaLabel="line" />);
    expect(container.querySelector('polyline[data-cir-part="chart-line"]')).toBeTruthy();
  });

  it('renders rects for kind="bar" with native <title> tooltips', () => {
    const { container } = render(<Chart kind="bar" data={DATA} ariaLabel="bar" />);
    const bars = container.querySelectorAll('rect[data-cir-part="chart-bar"]');
    expect(bars.length).toBe(DATA.length);
    expect(bars[0]?.querySelector('title')?.textContent).toContain('Mon');
  });

  it('renders a path for kind="area"', () => {
    const { container } = render(<Chart kind="area" data={DATA} ariaLabel="area" />);
    expect(container.querySelector('path[data-cir-part="chart-area"]')).toBeTruthy();
  });

  it('renders an x-label and y-label when provided', () => {
    render(<Chart kind="line" data={DATA} xLabel="Day" yLabel="Visits" ariaLabel="ax" />);
    expect(screen.getByText('Day')).toBeTruthy();
    expect(screen.getByText('Visits')).toBeTruthy();
  });

  it('handles a single-point series without crashing', () => {
    const { container } = render(
      <Chart kind="line" data={[{ x: 'a', y: 5 }]} ariaLabel="single" />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('handles all-equal y values without dividing by zero', () => {
    const { container } = render(
      <Chart
        kind="line"
        data={[
          { x: 'a', y: 5 },
          { x: 'b', y: 5 },
        ]}
        ariaLabel="flat"
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('handles empty data without crashing', () => {
    const { container } = render(<Chart kind="bar" data={[]} ariaLabel="empty" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('[data-cir-part="chart-bar"]').length).toBe(0);
  });

  it('text-render reports kind and point count', () => {
    expect(chartTextRender({ kind: 'bar', data: DATA, ariaLabel: 'a' })).toBe(
      '[Chart: bar (5 points)]',
    );
  });

  it('binding id matches', () => {
    expect(ChartBinding.id).toBe('Chart');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<Chart kind="line" data={DATA} ariaLabel="a" />);
    const svg = container.querySelector('[data-cir-component="Chart"]');
    expect(svg?.getAttribute('data-variant')).toBe('default');
  });
  it('variant=minimal still renders axes but suppresses labels', () => {
    const { container } = render(
      <Chart kind="line" data={DATA} ariaLabel="a" variant="minimal" xLabel="X" yLabel="Y" />,
    );
    expect(container.querySelector('[data-cir-part="chart-y-axis"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-part="chart-x-label"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="chart-y-label"]')).toBeNull();
  });
  it('variant=sparkline strips axes', () => {
    const { container } = render(
      <Chart kind="line" data={DATA} ariaLabel="a" variant="sparkline" />,
    );
    expect(container.querySelector('[data-cir-part="chart-y-axis"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="chart-x-axis"]')).toBeNull();
  });
});
