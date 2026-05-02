// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Spinner — accessible loading indicator. Variants (Wave 6 / P-10):
 * bordered, elevated, ghost (default), tinted.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, feedbackVariantClass, type FeedbackVariant } from './_variants.js';

export type SpinnerVariant = FeedbackVariant;

export interface SpinnerProps {
  label?: string;
  srOnly?: boolean;
  variant?: SpinnerVariant;
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

export function Spinner({
  label = 'Loading…',
  srOnly = false,
  variant = 'ghost',
  className,
}: SpinnerProps): ReactNode {
  return (
    <output
      role="status"
      aria-live="polite"
      data-cir-component="Spinner"
      data-cir-phase="4b-static"
      data-variant={variant}
      className={cn(feedbackVariantClass[variant], className)}
    >
      <span style={srOnly ? SR_ONLY_STYLE : undefined}>{label}</span>
    </output>
  );
}
Spinner.displayName = 'Spinner';
export function spinnerTextRender(props: SpinnerProps): string {
  return `[Spinner: ${props.label ?? 'Loading…'}]`;
}
export const SpinnerBinding: ComponentBinding = { id: 'Spinner', factory: Spinner };
