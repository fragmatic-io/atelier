// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Skeleton — decorative loading placeholder. Variants (Wave 6 / P-10):
 * bordered, elevated, ghost, tinted (default).
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, feedbackVariantClass, type FeedbackVariant } from './_variants.js';

export type SkeletonRadius = 'sm' | 'md' | 'full';
export type SkeletonVariant = FeedbackVariant;

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: SkeletonRadius;
  variant?: SkeletonVariant;
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
  variant = 'tinted',
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
      data-variant={variant}
      className={cn(feedbackVariantClass[variant], className)}
      style={style}
    />
  );
}
Skeleton.displayName = 'Skeleton';
export function skeletonTextRender(_props: SkeletonProps): string {
  return '[Skeleton]';
}
export const SkeletonBinding: ComponentBinding = { id: 'Skeleton', factory: Skeleton };
