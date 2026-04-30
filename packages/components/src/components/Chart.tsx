// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Chart — pure SVG bar / line / area chart. No third-party charting library.
 *
 * Scales are computed inline:
 *   - x is index-based (uniform spacing per data point), label drawn from
 *     the original `data[i].x`.
 *   - y is a linear scale from `[min(y), max(y)]` mapped to the inner plot
 *     height. If all y values are equal, we expand the range by one unit so
 *     the chart still draws.
 *
 * Each rendered point includes a `<title>` for native browser tooltips,
 * and the chart itself exposes `aria-label` (required) plus
 * `role="img"` so AT presents it as a single graphic.
 *
 * Phase 6 may swap this for a richer renderer; the API kept narrow on
 * purpose so a richer impl can land without breaking manifest authors.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, chartVariantClass, type ChartVariant } from './_variants.js';

export interface ChartDatum {
  x: string | number;
  y: number;
}

export interface ChartProps {
  kind: 'line' | 'bar' | 'area';
  data: readonly ChartDatum[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  ariaLabel: string;
  className?: string;
  /**
   * Visual variant. `default` shows axes + tick labels; `minimal` drops the
   * axis labels (axis lines stay); `sparkline` strips chrome entirely so the
   * chart renders as just the data path, suitable for inline cells.
   */
  variant?: ChartVariant;
}

const PADDING = { top: 16, right: 16, bottom: 32, left: 40 };

function computeYDomain(data: readonly ChartDatum[]): { min: number; max: number } {
  if (data.length === 0) return { min: 0, max: 1 };
  let min = data[0]!.y;
  let max = data[0]!.y;
  for (const d of data) {
    if (d.y < min) min = d.y;
    if (d.y > max) max = d.y;
  }
  if (min === max) {
    // Nudge so we get a visible range.
    return { min: min - 1, max: max + 1 };
  }
  return { min, max };
}

export function Chart({
  kind,
  data,
  width = 600,
  height = 240,
  xLabel,
  yLabel,
  ariaLabel,
  className,
  variant = 'default',
}: ChartProps): ReactNode {
  const showAxes = variant !== 'sparkline';
  const showLabels = variant === 'default';
  const innerW = Math.max(0, width - PADDING.left - PADDING.right);
  const innerH = Math.max(0, height - PADDING.top - PADDING.bottom);
  const { min, max } = computeYDomain(data);
  const yRange = max - min;

  const xFor = (i: number): number => {
    if (data.length <= 1) return PADDING.left + innerW / 2;
    return PADDING.left + (i / (data.length - 1)) * innerW;
  };
  const yFor = (v: number): number => {
    const t = yRange === 0 ? 0.5 : (v - min) / yRange;
    return PADDING.top + (1 - t) * innerH;
  };

  const points = data.map((d, i) => ({ cx: xFor(i), cy: yFor(d.y), datum: d }));

  let body: ReactNode;
  if (kind === 'line') {
    const polyPoints = points.map((p) => `${String(p.cx)},${String(p.cy)}`).join(' ');
    body = (
      <polyline
        points={polyPoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        data-cir-part="chart-line"
      />
    );
  } else if (kind === 'area') {
    const baseY = PADDING.top + innerH;
    const head = points.map((p) => `${String(p.cx)},${String(p.cy)}`).join(' ');
    const last = points[points.length - 1];
    const first = points[0];
    const path =
      data.length === 0
        ? ''
        : `M ${String(first!.cx)},${String(baseY)} L ${head} L ${String(last!.cx)},${String(baseY)} Z`;
    body = (
      <path
        d={path}
        fill="currentColor"
        fillOpacity={0.25}
        stroke="currentColor"
        strokeWidth={2}
        data-cir-part="chart-area"
      />
    );
  } else {
    // bar
    const barWidth = data.length > 0 ? Math.max(2, innerW / data.length - 4) : 0;
    const baseY = PADDING.top + innerH;
    body = (
      <g data-cir-part="chart-bars">
        {points.map((p, i) => (
          <rect
            key={`${String(p.datum.x)}-${String(i)}`}
            x={p.cx - barWidth / 2}
            y={p.cy}
            width={barWidth}
            height={Math.max(0, baseY - p.cy)}
            fill="currentColor"
            data-cir-part="chart-bar"
          >
            <title>{`${String(p.datum.x)}: ${String(p.datum.y)}`}</title>
          </rect>
        ))}
      </g>
    );
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      data-cir-component="Chart"
      data-kind={kind}
      data-variant={variant}
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      className={cn(chartVariantClass[variant], className)}
    >
      {/* axes */}
      {showAxes ? (
        <>
          <line
            x1={PADDING.left}
            y1={PADDING.top}
            x2={PADDING.left}
            y2={PADDING.top + innerH}
            stroke="currentColor"
            strokeOpacity={0.4}
            data-cir-part="chart-y-axis"
          />
          <line
            x1={PADDING.left}
            y1={PADDING.top + innerH}
            x2={PADDING.left + innerW}
            y2={PADDING.top + innerH}
            stroke="currentColor"
            strokeOpacity={0.4}
            data-cir-part="chart-x-axis"
          />
        </>
      ) : null}
      {body}
      {kind !== 'bar'
        ? points.map((p, i) => (
            <circle
              key={`pt-${String(i)}`}
              cx={p.cx}
              cy={p.cy}
              r={3}
              fill="currentColor"
              data-cir-part="chart-point"
            >
              <title>{`${String(p.datum.x)}: ${String(p.datum.y)}`}</title>
            </circle>
          ))
        : null}
      {showLabels && xLabel !== undefined ? (
        <text
          x={PADDING.left + innerW / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={11}
          fill="currentColor"
          data-cir-part="chart-x-label"
        >
          {xLabel}
        </text>
      ) : null}
      {showLabels && yLabel !== undefined ? (
        <text
          x={12}
          y={PADDING.top + innerH / 2}
          textAnchor="middle"
          fontSize={11}
          fill="currentColor"
          transform={`rotate(-90, 12, ${String(PADDING.top + innerH / 2)})`}
          data-cir-part="chart-y-label"
        >
          {yLabel}
        </text>
      ) : null}
    </svg>
  );
}

Chart.displayName = 'Chart';

export function chartTextRender(props: ChartProps): string {
  return `[Chart: ${props.kind} (${String(props.data.length)} points)]`;
}

export const ChartBinding: ComponentBinding = {
  id: 'Chart',
  factory: Chart,
};
