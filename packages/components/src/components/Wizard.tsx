// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wizard — a controlled, multi-step flow. The host owns `currentId` and
 * receives `onStepChange(id)` whenever the user presses Prev/Next. When
 * Next is pressed on the last step, `onComplete` fires (and `onStepChange`
 * is NOT called — the wizard does not invent a step id).
 *
 * Renders a horizontal stepper at the top (each step shows `done` / `active`
 * / `pending` via `data-state`), the active step's content, and Prev/Next
 * controls. The stepper itself is a `<ol>` for semantic ordering.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { Button } from './Button.js';
import { cn, wizardVariantClass, type WizardVariant } from './_variants.js';

export interface WizardStep {
  id: string;
  title: string;
  content: ReactNode;
}

export interface WizardProps {
  steps: readonly WizardStep[];
  currentId: string;
  onStepChange: (id: string) => void;
  onComplete?: () => void;
  className?: string;
  variant?: WizardVariant;
}

export function Wizard({
  steps,
  currentId,
  onStepChange,
  onComplete,
  className,
  variant = 'default',
}: WizardProps): ReactNode {
  const idx = steps.findIndex((s) => s.id === currentId);
  const safeIdx = idx < 0 ? 0 : idx;
  const active = steps[safeIdx];
  const isFirst = safeIdx === 0;
  const isLast = safeIdx === steps.length - 1;

  const goPrev = (): void => {
    const prev = steps[safeIdx - 1];
    if (prev) onStepChange(prev.id);
  };
  const goNext = (): void => {
    if (isLast) {
      onComplete?.();
      return;
    }
    const next = steps[safeIdx + 1];
    if (next) onStepChange(next.id);
  };

  return (
    <div
      data-cir-component="Wizard"
      data-variant={variant}
      className={cn(wizardVariantClass[variant], className)}
    >
      <ol data-cir-part="wizard-steps" aria-label="Wizard progress">
        {steps.map((s, i) => {
          const state = i < safeIdx ? 'done' : i === safeIdx ? 'active' : 'pending';
          return (
            <li
              key={s.id}
              data-cir-part="wizard-step"
              data-state={state}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span data-cir-part="wizard-step-index">{String(i + 1)}</span>
              <span data-cir-part="wizard-step-title">{s.title}</span>
            </li>
          );
        })}
      </ol>
      {active ? (
        <div data-cir-part="wizard-content" data-step-id={active.id}>
          {active.content}
        </div>
      ) : null}
      <div data-cir-part="wizard-actions">
        <Button variant="ghost" type="button" onClick={goPrev} disabled={isFirst}>
          Previous
        </Button>
        <Button variant="primary" type="button" onClick={goNext}>
          {isLast ? 'Finish' : 'Next'}
        </Button>
      </div>
    </div>
  );
}

Wizard.displayName = 'Wizard';

export function wizardTextRender(props: WizardProps): string {
  const idx = props.steps.findIndex((s) => s.id === props.currentId);
  const safe = idx < 0 ? 0 : idx;
  return `[Wizard: step ${String(safe + 1)}/${String(props.steps.length)}]`;
}

export const WizardBinding: ComponentBinding = {
  id: 'Wizard',
  factory: Wizard,
};
