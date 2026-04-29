// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Skeleton — purely decorative loading placeholder. Rendered as a
 * `<span aria-hidden="true">` so screen readers ignore it (the assistive
 * announcement should come from a sibling Spinner / Progress / `aria-busy`
 * region, not from the visual placeholder itself).
 *
 * `width` / `height` accept CSS lengths (`'100%'`, `'1em'`, `'2rem'`) or
 * raw numbers (interpreted as pixels). `radius` maps to a small token set;
 * `'full'` produces a pill shape. No animation in 4b — the markup contract
 * here is what a 4c CSS pass will hang the shimmer keyframe on.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type SkeletonRadius = 'sm' | 'md' | 'full';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: SkeletonRadius;
  className?: string;
}

const RADIUS_PX: Readonly<Record<SkeletonRadius, string>> = Object.freeze({
  sm: '4px',
  md: '8px',
  full: '9999px',
});

function toLen(v: string | number): string {
  return typeof v === 'number' ? `${String(v)}px` : v;
}

export function Skeleton({
  width = '100%',
  height = '1em',
  radius = 'sm',
  className,
}: SkeletonProps): ReactNode {
  const style: CSSProperties = {
    display: 'inline-block',
    width: toLen(width),
    height: toLen(height),
    borderRadius: RADIUS_PX[radius],
    backgroundColor: 'rgba(0,0,0,0.08)',
  };
  return (
    <span
      aria-hidden="true"
      data-cir-component="Skeleton"
      data-radius={radius}
      className={className}
      style={style}
    />
  );
}

Skeleton.displayName = 'Skeleton';

export function skeletonTextRender(_props: SkeletonProps): string {
  return '[Skeleton]';
}

export const SkeletonBinding: ComponentBinding = {
  id: 'Skeleton',
  factory: Skeleton,
};
