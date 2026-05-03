// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Skeleton — decorative loading placeholder.
 *
 * Wave 11 / Vis-8 — skeleton-as-shape, not as block. Best-in-class apps
 * (Linear, Stripe, Vercel) ship per-component skeleton shapes that mirror
 * the layout of the real content rather than rendering a single grey
 * rectangle. The `shape` prop drives a small catalog of layout-faithful
 * compositions:
 *
 *   - `rectangle`   — single block (the original / legacy default).
 *   - `circle`      — avatar / chip placeholder.
 *   - `line`        — single text line at a jittered 60–95 % width.
 *   - `stack`       — avatar + 2 text lines (chat message / list-row preview).
 *   - `card`        — header + media + 2 text lines.
 *   - `table-row`   — N column blocks; `count` tiles the row.
 *   - `kpi`         — label + value (KPI tile).
 *   - `list-row`    — checkbox square + text line (list / multi-select rows).
 *   - `detail-block`— hero + 3 stat blocks + 3 text lines (detail view).
 *
 * Legacy shape names from Wave 7b — `rect`, `text-line`,
 * `avatar-with-2-lines`, `kpi-tile`, `detail-view`, `gallery-tile`,
 * `timeline-event`, `text-paragraph` — remain accepted for back-compat and
 * are normalised to the canonical Wave 11 catalog at render time.
 *
 * Density-aware: row vertical padding for `table-row` and `list-row`
 * pulls from `DENSITY_ROW_PADDING_PX` so loading-state rows match the
 * populated state's row height (no jarring re-flow when data lands).
 *
 * ARIA (Wave 11): the wrapper carries `role="status"`, `aria-busy="true"`,
 * and `aria-label="Loading"` so assistive tech announces the placeholder
 * as a live region. Shimmer is suppressed under
 * `prefers-reduced-motion: reduce`.
 *
 * Composition rule: `Skeleton: { can_contain: 'leaf' }` — every shape is
 * layout-only (no slot for children).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import {
  cn,
  feedbackVariantClass,
  skeletonShapeClass,
  type FeedbackVariant,
  type SkeletonShape as CanonicalSkeletonShape,
} from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX, type Density } from './density.js';

export type SkeletonRadius = 'sm' | 'md' | 'full';
export type SkeletonVariant = FeedbackVariant;

/**
 * Canonical Wave 11 / Vis-8 shape catalog plus legacy Wave 7b aliases. The
 * legacy names normalise via `normaliseShape()` to one of the canonical
 * shapes — authors writing fresh code should reach for the Wave 11 names.
 */
export type SkeletonShape =
  | CanonicalSkeletonShape
  // Legacy Wave 7b aliases — preserved for back-compat. These map onto the
  // canonical catalog at render time; no behavioural difference.
  | 'rect'
  | 'text-line'
  | 'avatar-with-2-lines'
  | 'kpi-tile'
  | 'detail-view'
  | 'gallery-tile'
  | 'timeline-event'
  | 'text-paragraph';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: SkeletonRadius;
  variant?: SkeletonVariant;
  shape?: SkeletonShape;
  /** Repeat count for shapes that tile (table-row, list-row, line). Default 1. */
  count?: number;
  /** Column count for shape="table-row". Default 4. */
  columns?: number;
  /**
   * Wave 11 / Vis-6 — personalisation density. Threaded by the renderer so
   * loading-state rows match the populated state's row height. Skeleton
   * uses the value to scale `table-row` and `list-row` vertical padding;
   * `rectangle` and other shapes continue to honour explicit `width` /
   * `height` props.
   */
  density?: Density;
  className?: string;
  /**
   * Optional override for the announced label. Defaults to `"Loading"` so
   * screen readers consistently announce loading state across surfaces.
   */
  ariaLabel?: string;
}

const RADIUS_PX: Readonly<Record<SkeletonRadius, string>> = Object.freeze({
  sm: '4px',
  md: '8px',
  full: '9999px',
});

const BLOCK_BG = 'rgba(0,0,0,0.08)';

/**
 * Map every accepted shape value (canonical + legacy alias) to its canonical
 * Wave 11 catalog entry. Returning the canonical key keeps the rest of the
 * renderer + `data-shape` attribute consistent regardless of which alias the
 * caller supplied.
 */
function normaliseShape(shape: SkeletonShape): CanonicalSkeletonShape {
  switch (shape) {
    case 'rect':
      return 'rectangle';
    case 'text-line':
      return 'line';
    case 'avatar-with-2-lines':
      return 'stack';
    case 'kpi-tile':
      return 'kpi';
    case 'detail-view':
      return 'detail-block';
    // Legacy shapes that don't have a 1:1 Wave 11 equivalent — pick the
    // closest canonical fit so the placeholder still renders something
    // sensible, while authors migrate to the canonical names.
    case 'gallery-tile':
      return 'card';
    case 'timeline-event':
      return 'stack';
    case 'text-paragraph':
      return 'line';
    default:
      return shape;
  }
}

function toLen(v: string | number): string {
  return typeof v === 'number' ? `${String(v)}px` : v;
}

/**
 * Detect `prefers-reduced-motion: reduce`. Returns false during SSR and on
 * environments without `matchMedia`. Mirrors the helper in StatusBar /
 * HoverCard so behaviour stays consistent across the package.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => {
      setReduced(e.matches);
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return (): void => {
        mq.removeEventListener('change', onChange);
      };
    }
    mq.addListener(onChange);
    return (): void => {
      mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/**
 * Stable pseudo-random in [0, 1) keyed by `seed`. Used to vary text-line
 * widths between 60% and 95% so paragraphs do not look like a regular grid.
 * The output is deterministic per seed — re-renders never flicker.
 */
function stableRand(seed: number): number {
  // Simple LCG-style hash → fractional. Plenty of entropy for jitter.
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function textLineWidth(seed: number): string {
  const pct = 60 + Math.floor(stableRand(seed) * 36); // 60..95
  return `${String(pct)}%`;
}

/** A single rect block — internal building piece for composite shapes. */
function Block({
  width,
  height,
  radius = 'sm',
  style,
  className,
}: {
  width?: string | number;
  height?: string | number;
  radius?: SkeletonRadius;
  style?: CSSProperties;
  className?: string;
}): ReactNode {
  return (
    <div
      data-cir-skeleton-block=""
      className={className}
      style={{
        width: width === undefined ? '100%' : toLen(width),
        height: height === undefined ? '0.75em' : toLen(height),
        backgroundColor: BLOCK_BG,
        borderRadius: RADIUS_PX[radius],
        ...style,
      }}
    />
  );
}

// -----------------------------------------------------------------------------
// Per-shape renderers. Each returns a fragment of building blocks with no
// outer wrapper — the wrapper is supplied by `Skeleton` so it owns the
// data-* attributes, className, and shimmer.
// -----------------------------------------------------------------------------

function renderCircle(props: SkeletonProps): ReactNode {
  const size = props.width ?? props.height ?? 40;
  const len = toLen(size);
  return (
    <span
      data-cir-skeleton-block=""
      style={{
        display: 'inline-block',
        width: len,
        height: len,
        borderRadius: '9999px',
        backgroundColor: BLOCK_BG,
      }}
    />
  );
}

function renderLine(seed = 0): ReactNode {
  return <Block width={textLineWidth(seed)} height="0.85em" />;
}

function renderStack(): ReactNode {
  return (
    <>
      <span
        data-cir-skeleton-block=""
        style={{
          flex: '0 0 auto',
          width: 40,
          height: 40,
          borderRadius: '9999px',
          backgroundColor: BLOCK_BG,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto' }}>
        <Block width={textLineWidth(1)} height="0.9em" />
        <Block width={textLineWidth(2)} height="0.7em" style={{ opacity: 0.7 }} />
      </div>
    </>
  );
}

function renderCard(): ReactNode {
  return (
    <>
      <Block width="40%" height="1em" />
      <Block width="100%" height="80px" radius="md" />
      <Block width={textLineWidth(3)} height="0.75em" />
      <Block width={textLineWidth(4)} height="0.75em" />
    </>
  );
}

function renderTableRow(columns: number, rowSeed: number, density: Density): ReactNode {
  const cells = [];
  for (let i = 0; i < columns; i += 1) {
    cells.push(
      <Block
        key={i}
        width={textLineWidth(rowSeed * 7 + i)}
        height="0.85em"
        style={{ flex: '1 1 0' }}
      />,
    );
  }
  // Wave 11 / Vis-6 — row vertical padding tracks the effective density so
  // the skeleton's row height matches the populated `<List>` / `<Table>`
  // row height (no jarring re-flow when data lands).
  const rowPad = DENSITY_ROW_PADDING_PX[density];
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: `${String(rowPad)}px 0`,
      }}
    >
      {cells}
    </div>
  );
}

function renderKpi(): ReactNode {
  return (
    <>
      <Block width="40%" height="0.7em" style={{ opacity: 0.7 }} />
      <Block width="60%" height="1.5em" />
    </>
  );
}

function renderListRow(rowSeed: number, density: Density): ReactNode {
  // Checkbox square — fixed 16x16 sm-radius block to match the populated
  // `<List>` row's selection indicator.
  const rowPad = DENSITY_ROW_PADDING_PX[density];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: `${String(rowPad)}px 0`,
      }}
    >
      <span
        data-cir-skeleton-block=""
        style={{
          flex: '0 0 auto',
          width: 16,
          height: 16,
          borderRadius: RADIUS_PX.sm,
          backgroundColor: BLOCK_BG,
        }}
      />
      <Block width={textLineWidth(rowSeed * 11 + 3)} height="0.85em" style={{ flex: '1 1 auto' }} />
    </div>
  );
}

function renderDetailBlock(): ReactNode {
  return (
    <>
      <Block width="100%" height="120px" radius="md" />
      <div style={{ display: 'flex', gap: 12 }}>
        <Block width="33%" height="2em" />
        <Block width="33%" height="2em" />
        <Block width="33%" height="2em" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Block width={textLineWidth(5)} height="0.75em" />
        <Block width={textLineWidth(6)} height="0.75em" />
        <Block width={textLineWidth(7)} height="0.75em" />
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------

export function Skeleton({
  width = '100%',
  height = '1em',
  radius = 'sm',
  variant = 'tinted',
  shape = 'rectangle',
  count = 1,
  columns = 4,
  density = DEFAULT_DENSITY,
  className,
  ariaLabel = 'Loading',
}: SkeletonProps): ReactNode {
  const reducedMotion = usePrefersReducedMotion();
  const animateClass = reducedMotion ? undefined : 'animate-pulse';
  const canonical = normaliseShape(shape);

  const safeCount = Math.max(1, Math.floor(count));
  const safeCols = Math.max(1, Math.floor(columns));

  // ---------------------------------------------------------------------------
  // Backwards compat: the default `rectangle` shape preserves the original
  // <span> element (inline-block) so existing usage that styles
  // `Skeleton` as an inline placeholder keeps working. ARIA upgrades to
  // role="status" + aria-busy="true" + aria-label so screen readers
  // announce the placeholder as a live region.
  // ---------------------------------------------------------------------------
  if (canonical === 'rectangle') {
    const style: CSSProperties = {
      display: 'inline-block',
      width: toLen(width),
      height: toLen(height),
      borderRadius: RADIUS_PX[radius],
      backgroundColor: BLOCK_BG,
    };
    return (
      <span
        role="status"
        aria-busy="true"
        aria-label={ariaLabel}
        data-cir-component="Skeleton"
        data-shape="rectangle"
        data-radius={radius}
        data-variant={variant}
        data-density={density}
        data-cir-density={density}
        className={cn(
          feedbackVariantClass[variant],
          skeletonShapeClass.rectangle,
          animateClass,
          className,
        )}
        style={style}
      />
    );
  }

  // Composite shapes share a block-level wrapper so flex / grid children
  // lay out as expected. We still emit the same canonical data attributes.
  const wrapperStyle: CSSProperties = {
    display: 'block',
    width: toLen(width),
  };

  let body: ReactNode;
  switch (canonical) {
    case 'circle':
      body = renderCircle({ width, height });
      break;
    case 'line': {
      // For paragraph-like rendering, callers pass count > 1 and we tile
      // the line shape, jittering the seed so adjacent lines differ.
      if (safeCount > 1) {
        const lines = [];
        for (let i = 0; i < safeCount; i += 1) {
          lines.push(<div key={i}>{renderLine(i + 11)}</div>);
        }
        body = <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{lines}</div>;
      } else {
        body = renderLine(0);
      }
      break;
    }
    case 'stack':
      body = renderStack();
      break;
    case 'card':
      body = renderCard();
      break;
    case 'table-row': {
      const rows = [];
      for (let i = 0; i < safeCount; i += 1) {
        rows.push(<div key={i}>{renderTableRow(safeCols, i, density)}</div>);
      }
      body = rows;
      break;
    }
    case 'kpi':
      body = renderKpi();
      break;
    case 'list-row': {
      const rows = [];
      for (let i = 0; i < safeCount; i += 1) {
        rows.push(<div key={i}>{renderListRow(i, density)}</div>);
      }
      body = rows;
      break;
    }
    case 'detail-block':
      body = renderDetailBlock();
      break;
    default: {
      // Exhaustive guard: TS will fire if a new canonical shape is added
      // without a case here.
      const _never: never = canonical;
      body = _never;
    }
  }

  // For composite shapes we lean on the shape-class wrapper for layout
  // (Tailwind hosts pick it up; non-Tailwind hosts fall back to the inline
  // styles emitted by each per-shape renderer).
  const wrapperLayoutClass = skeletonShapeClass[canonical];

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      data-cir-component="Skeleton"
      data-shape={canonical}
      data-radius={radius}
      data-variant={variant}
      data-density={density}
      data-cir-density={density}
      data-count={String(safeCount)}
      data-columns={canonical === 'table-row' ? String(safeCols) : undefined}
      className={cn(feedbackVariantClass[variant], wrapperLayoutClass, animateClass, className)}
      style={wrapperStyle}
    >
      {body}
    </div>
  );
}
Skeleton.displayName = 'Skeleton';
export function skeletonTextRender(_props: SkeletonProps): string {
  return '[Skeleton]';
}
export const SkeletonBinding: ComponentBinding = { id: 'Skeleton', factory: Skeleton };
