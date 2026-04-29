// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Toggle — controlled on/off switch. Rendered as `<button role="switch"
 * aria-checked>` rather than a styled checkbox: native `role="switch"`
 * handles spacebar/enter activation and announces "on/off" to screen
 * readers, which a CSS-styled checkbox cannot match without re-implementing
 * the a11y contract.
 *
 * Label is required and clicking it toggles via the surrounding
 * `<label>`-wrap pattern (`htmlFor` on the button). Forward ref for focus
 * management (e.g. settings dialog autofocus).
 */
import { forwardRef, useId, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { label, checked, onChange, id, name, disabled, className }: ToggleProps,
  ref,
): ReactNode {
  const generatedId = useId();
  const toggleId = id ?? `cir-toggle-${generatedId}`;
  const labelId = `${toggleId}-label`;
  return (
    <div data-cir-component="Toggle" className={className}>
      <span id={labelId} data-cir-part="toggle-label">
        {label}
      </span>
      <button
        ref={ref}
        id={toggleId}
        type="button"
        role="switch"
        name={name}
        disabled={disabled}
        aria-checked={checked}
        aria-labelledby={labelId}
        data-checked={checked ? 'true' : 'false'}
        onClick={() => {
          onChange(!checked);
        }}
      />
    </div>
  );
});

export function toggleTextRender(props: ToggleProps): string {
  return `[Toggle: ${props.label} = ${props.checked ? 'on' : 'off'}]`;
}

export const ToggleBinding: ComponentBinding = {
  id: 'Toggle',
  factory: Toggle,
};
