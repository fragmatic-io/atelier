// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Slider — controlled `<input type="range">`. Native widget chosen so
 * keyboard nav (Arrow / PageUp / Home / End) and ARIA (`aria-valuemin`,
 * `aria-valuemax`, `aria-valuenow`) come for free. `displayValue` shows the
 * current numeric value next to the label by default — toggle off when the
 * value is conveyed elsewhere in the layout.
 */
import { forwardRef, useId, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, inputVariantClass, type InputVariant } from './_variants.js';

export type SliderVariant = InputVariant;

export interface SliderProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  displayValue?: boolean;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  variant?: SliderVariant;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    displayValue = true,
    id,
    name,
    disabled,
    className,
    variant = 'default',
  }: SliderProps,
  ref,
): ReactNode {
  const generatedId = useId();
  const inputId = id ?? `cir-slider-${generatedId}`;
  return (
    <div
      data-cir-component="Slider"
      data-variant={variant}
      className={cn(inputVariantClass[variant], className)}
    >
      <label htmlFor={inputId} data-cir-part="slider-label">
        {label}
        {displayValue ? <span data-cir-part="slider-value">{` ${String(value)}`}</span> : null}
      </label>
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const parsed = Number(e.currentTarget.value);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
});

export function sliderTextRender(props: SliderProps): string {
  return `[Slider: ${props.label} = ${String(props.value)}]`;
}

export const SliderBinding: ComponentBinding = {
  id: 'Slider',
  factory: Slider,
};
