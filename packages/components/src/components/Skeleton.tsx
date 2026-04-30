// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Skeleton — decorative loading placeholder. Variants (Wave 6 / P-10):
 * bordered, elevated, ghost, tinted (default).
 *
 * Wave 7b / Vis-8 adds a `shape` prop so authors can match the placeholder
 * to the layout of the real content (avatar + 2 lines, table-row, kpi-tile,
 * etc.). All shapes share a single shimmer (`animate-pulse`, a Tailwind
 * utility); the shimmer is suppressed under `prefers-reduced-motion: reduce`.
 *
 * Composition rule: `Skeleton: { can_contain: 'leaf' }` — every shape is
 * layout-only (no slot for children).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, feedbackVariantClass, type FeedbackVariant } from './_variants.js';

export type SkeletonRadius = 'sm' | 'md' | 'full';
export type SkeletonVariant = FeedbackVariant;

export type SkeletonShape =
  | 'rect'
  | 'circle'
  | 'text-line'
  | 'avatar-with-2-lines'
  | 'card'
  | 'table-row'
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
  /** Repeat count for shapes that tile (table-row, text-paragraph). Default 1. */
  count?: number;
  /** Column count for shape="table-row". Default 4. */
  columns?: number;
  className?: string;
}

const RADIUS_PX: Readonly<Record<SkeletonRadius, string>> = Object.freeze({
  sm: '4px',
  md: '8px',
  full: '9999px',
});

const BLOCK_BG = 'rgba(0,0,0,0.08)';

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

function blockStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    backgroundColor: BLOCK_BG,
    borderRadius: RADIUS_PX.sm,
    ...extra,
  };
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

function renderTextLine(seed = 0): ReactNode {
  return <Block width={textLineWidth(seed)} height="0.85em" />;
}

function renderAvatarWith2Lines(): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
    </div>
  );
}

function renderCard(): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        ...blockStyle({ backgroundColor: 'transparent', borderRadius: RADIUS_PX.md }),
      }}
    >
      <Block width="40%" height="1em" />
      <Block width="100%" height="80px" radius="md" />
      <Block width={textLineWidth(3)} height="0.75em" />
      <Block width={textLineWidth(4)} height="0.75em" />
    </div>
  );
}

function renderTableRow(columns: number, rowSeed: number): ReactNode {
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
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>{cells}</div>
  );
}

function renderKpiTile(): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
      }}
    >
      <Block width="40%" height="0.7em" style={{ opacity: 0.7 }} />
      <Block width="60%" height="1.5em" />
    </div>
  );
}

function renderDetailView(): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12 }}>
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
    </div>
  );
}

function renderGalleryTile(): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Block width="100%" height="120px" radius="md" />
      <Block width={textLineWidth(8)} height="0.75em" />
    </div>
  );
}

function renderTimelineEvent(): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span
        data-cir-skeleton-block=""
        style={{
          flex: '0 0 auto',
          width: 12,
          height: 12,
          borderRadius: '9999px',
          backgroundColor: BLOCK_BG,
          marginTop: 4,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 auto' }}>
        <Block width="30%" height="0.7em" style={{ opacity: 0.7 }} />
        <Block width={textLineWidth(9)} height="0.85em" />
      </div>
    </div>
  );
}

function renderTextParagraphLine(idx: number): ReactNode {
  return <Block width={textLineWidth(idx + 11)} height="0.75em" />;
}

// -----------------------------------------------------------------------------

export function Skeleton({
  width = '100%',
  height = '1em',
  radius = 'sm',
  variant = 'tinted',
  shape = 'rect',
  count = 1,
  columns = 4,
  className,
}: SkeletonProps): ReactNode {
  const reducedMotion = usePrefersReducedMotion();
  const animateClass = reducedMotion ? undefined : 'animate-pulse';

  // ---------------------------------------------------------------------------
  // Backwards compat: the default `rect` shape preserves the original
  // <span> element, inline-block layout, and surface attributes. Only the
  // animate-pulse class is a net-new addition.
  // ---------------------------------------------------------------------------
  if (shape === 'rect') {
    const style: CSSProperties = {
      display: 'inline-block',
      width: toLen(width),
      height: toLen(height),
      borderRadius: RADIUS_PX[radius],
      backgroundColor: BLOCK_BG,
    };
    return (
      <span
        aria-hidden="true"
        data-cir-component="Skeleton"
        data-shape="rect"
        data-radius={radius}
        data-variant={variant}
        className={cn(feedbackVariantClass[variant], animateClass, className)}
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

  const safeCount = Math.max(1, Math.floor(count));
  const safeCols = Math.max(1, Math.floor(columns));

  let body: ReactNode;
  switch (shape) {
    case 'circle':
      body = renderCircle({ width, height });
      break;
    case 'text-line':
      body = renderTextLine(0);
      break;
    case 'avatar-with-2-lines':
      body = renderAvatarWith2Lines();
      break;
    case 'card':
      body = renderCard();
      break;
    case 'table-row': {
      const rows = [];
      for (let i = 0; i < safeCount; i += 1) {
        rows.push(<div key={i}>{renderTableRow(safeCols, i)}</div>);
      }
      body = <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{rows}</div>;
      break;
    }
    case 'kpi-tile':
      body = renderKpiTile();
      break;
    case 'detail-view':
      body = renderDetailView();
      break;
    case 'gallery-tile':
      body = renderGalleryTile();
      break;
    case 'timeline-event':
      body = renderTimelineEvent();
      break;
    case 'text-paragraph': {
      const lines = [];
      const n = Math.max(1, Math.floor(count));
      for (let i = 0; i < n; i += 1) {
        lines.push(<div key={i}>{renderTextParagraphLine(i)}</div>);
      }
      body = <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{lines}</div>;
      break;
    }
    default: {
      // Exhaustive guard: TS will fire if a new shape is added without a case.
      const _never: never = shape;
      body = _never;
    }
  }

  return (
    <div
      aria-hidden="true"
      data-cir-component="Skeleton"
      data-shape={shape}
      data-radius={radius}
      data-variant={variant}
      data-count={String(safeCount)}
      data-columns={shape === 'table-row' ? String(safeCols) : undefined}
      className={cn(feedbackVariantClass[variant], animateClass, className)}
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
