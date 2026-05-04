// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Select — controlled Radix select. This keeps the manifest-facing contract
 * flat while giving hosts a themeable trigger/content surface and Radix's
 * keyboard/focus behavior.
 */
import * as RadixSelect from '@radix-ui/react-select';
import { useId, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  label,
  options,
  value,
  onChange,
  id,
  name,
  disabled,
  className,
}: SelectProps): ReactNode {
  const generatedId = useId();
  const labelId = id ?? `cir-select-${generatedId}`;
  const current = options.find((opt) => opt.value === value);
  return (
    <div data-cir-component="Select" className={className}>
      <span id={labelId} data-cir-part="select-label">
        {label}
      </span>
      <RadixSelect.Root
        value={value}
        onValueChange={onChange}
        {...(name !== undefined ? { name } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
      >
        <RadixSelect.Trigger aria-labelledby={labelId} data-cir-part="select-trigger">
          <RadixSelect.Value placeholder={current?.label ?? label} />
          <RadixSelect.Icon data-cir-part="select-icon" aria-hidden>
            ▾
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            data-cir-part="select-content"
            data-elevation="popover"
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport data-cir-part="select-viewport">
              {options.map((opt) => (
                <RadixSelect.Item key={opt.value} value={opt.value} data-cir-part="select-option">
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator data-cir-part="select-option-indicator">
                    ✓
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}

Select.displayName = 'Select';

export function selectTextRender(props: SelectProps): string {
  const current = props.options.find((o) => o.value === props.value);
  return `[Select: ${props.label} = ${current?.label ?? props.value}]`;
}

export const SelectBinding: ComponentBinding = {
  id: 'Select',
  factory: Select,
};
