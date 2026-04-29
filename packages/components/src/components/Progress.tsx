// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Progress — accessible progress indicator backed by HTML `<progress>`.
 * When `value` is provided (0-100), the element advertises a determinate
 * progress; omitting `value` produces an indeterminate `<progress>` (no
 * `value` / `max` attributes), which is the platform convention for
 * "working but unbounded".
 *
 * `label` is associated with the progress element via `aria-labelledby`
 * (or visually hidden when `srOnlyLabel` is true so the bar can sit alone
 * in the layout).
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface ProgressProps {
  value?: number;
  label?: string;
  srOnlyLabel?: boolean;
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
  className,
}: ProgressProps): ReactNode {
  const baseId = useId();
  const labelId = label !== undefined ? `${baseId}-label` : undefined;
  const indeterminate = value === undefined;
  return (
    <div
      data-cir-component="Progress"
      data-mode={indeterminate ? 'indeterminate' : 'value'}
      className={className}
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

export const ProgressBinding: ComponentBinding = {
  id: 'Progress',
  factory: Progress,
};
