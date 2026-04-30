// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Stepper — standalone progress strip. Each step carries an explicit
 * `status` (`pending` / `active` / `done` / `error`) so the host can drive
 * non-linear flows; the component itself does no inference. `orientation`
 * toggles the layout direction; the active step gets `aria-current="step"`.
 *
 * Pure (no hooks). The list is rendered as `<ol>` for semantic ordering;
 * status is surfaced as `data-state` so a Phase 4c stylesheet can paint
 * checkmarks / connectors per step.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, stepperVariantClass, type StepperVariant } from './_variants.js';

export type StepperStatus = 'pending' | 'active' | 'done' | 'error';
export type StepperOrientation = 'horizontal' | 'vertical';

export interface StepperStep {
  id: string;
  title: string;
  status: StepperStatus;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  orientation?: StepperOrientation;
  className?: string;
  'aria-label'?: string;
  /**
   * Vis-4 visual variant. Defaults to mirror `orientation` — a `vertical`
   * orientation maps to `'vertical'` and `horizontal` to `'horizontal'`.
   * Pass `'numbered'` for a tighter, connector-less display.
   */
  variant?: StepperVariant;
}

export function Stepper({
  steps,
  orientation = 'horizontal',
  className,
  'aria-label': ariaLabel = 'Progress',
  variant,
}: StepperProps): ReactNode {
  const effectiveVariant: StepperVariant = variant ?? orientation;
  return (
    <ol
      data-cir-component="Stepper"
      data-orientation={orientation}
      data-variant={effectiveVariant}
      aria-label={ariaLabel}
      className={cn(stepperVariantClass[effectiveVariant], className)}
      style={{
        display: 'flex',
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
        gap: '12px',
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      {steps.map((s, i) => (
        <li
          key={s.id}
          data-cir-part="stepper-step"
          data-state={s.status}
          aria-current={s.status === 'active' ? 'step' : undefined}
        >
          <span data-cir-part="stepper-index">{String(i + 1)}</span>
          <span data-cir-part="stepper-title">{s.title}</span>
        </li>
      ))}
    </ol>
  );
}

Stepper.displayName = 'Stepper';

export function stepperTextRender(props: StepperProps): string {
  const active = props.steps.findIndex((s) => s.status === 'active');
  const i = active < 0 ? 0 : active + 1;
  return `[Stepper: ${String(i)}/${String(props.steps.length)}]`;
}

export const StepperBinding: ComponentBinding = {
  id: 'Stepper',
  factory: Stepper,
};
