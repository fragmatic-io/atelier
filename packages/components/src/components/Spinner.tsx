// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Spinner — accessible loading indicator. Rendered as `<output role="status"
 * aria-live="polite">` so the label is announced when it appears. The visual
 * is intentionally STATIC text in Phase 4b — there is no spinning glyph or
 * animation. A Phase 4c CSS pass will add the rotation keyframe and glyph;
 * the markup contract here is what the animation will hang off of.
 *
 * `srOnly` hides the label visually (clip-path technique) while keeping it
 * available to screen readers — useful when the spinner sits next to its
 * own label in the layout.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface SpinnerProps {
  label?: string;
  srOnly?: boolean;
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
  className,
}: SpinnerProps): ReactNode {
  return (
    <output
      role="status"
      aria-live="polite"
      data-cir-component="Spinner"
      data-cir-phase="4b-static"
      className={className}
    >
      <span style={srOnly ? SR_ONLY_STYLE : undefined}>{label}</span>
    </output>
  );
}

Spinner.displayName = 'Spinner';

export function spinnerTextRender(props: SpinnerProps): string {
  return `[Spinner: ${props.label ?? 'Loading…'}]`;
}

export const SpinnerBinding: ComponentBinding = {
  id: 'Spinner',
  factory: Spinner,
};
