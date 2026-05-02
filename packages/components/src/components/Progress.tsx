// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * Progress — accessible progress indicator. Variants (Wave 6 / P-10):
 * bordered, elevated, ghost (default), tinted.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, feedbackVariantClass, type FeedbackVariant } from './_variants.js';

export type ProgressVariant = FeedbackVariant;

export interface ProgressProps {
  value?: number;
  label?: string;
  srOnlyLabel?: boolean;
  variant?: ProgressVariant;
  className?: string;
}

const SR_ONLY_STYLE: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function Progress({
  value,
  label,
  srOnlyLabel = false,
  variant = 'ghost',
  className,
}: ProgressProps): ReactNode {
  const baseId = useId();
  const labelId = label !== undefined ? `${baseId}-label` : undefined;
  const indeterminate = value === undefined;
  return (
    <div
      data-cir-component="Progress"
      data-mode={indeterminate ? 'indeterminate' : 'value'}
      data-variant={variant}
      className={cn(feedbackVariantClass[variant], className)}
    >
      {label !== undefined ? (
        <span
          id={labelId}
          data-cir-part="progress-label"
          style={srOnlyLabel ? SR_ONLY_STYLE : undefined}
        >
          {label}
        </span>
      ) : null}
      {indeterminate ? (
        <progress aria-labelledby={labelId} data-cir-part="progress-bar" />
      ) : (
        <progress aria-labelledby={labelId} data-cir-part="progress-bar" value={value} max={100} />
      )}
    </div>
  );
}
Progress.displayName = 'Progress';
export function progressTextRender(props: ProgressProps): string {
  if (props.value === undefined) return '[Progress: indeterminate]';
  return `[Progress: ${String(props.value)}%]`;
}
export const ProgressBinding: ComponentBinding = { id: 'Progress', factory: Progress };
