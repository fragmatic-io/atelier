// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Accordion — disclosure group rendered with semantic `<details>` /
 * `<summary>`. Using the platform element gives keyboard activation
 * (Enter / Space), correct ARIA semantics, and `<summary>` focusability for
 * free.
 *
 * State is internal: `defaultOpen` seeds which items are open initially and
 * `multiple` toggles between accordion-style (one open at a time, default)
 * and disclosure-set (independent items). Items are kept controlled via
 * `open` so React owns the truth even when the user clicks the summary.
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface AccordionItem {
  id: string;
  header: ReactNode;
  content: ReactNode;
}

export interface AccordionProps {
  items: readonly AccordionItem[];
  multiple?: boolean;
  defaultOpen?: readonly string[];
  className?: string;
}

export function Accordion({
  items,
  multiple = false,
  defaultOpen,
  className,
}: AccordionProps): ReactNode {
  const [openSet, setOpenSet] = useState<ReadonlySet<string>>(() => new Set(defaultOpen ?? []));

  const onToggle = (id: string, event: SyntheticEvent<HTMLDetailsElement>): void => {
    const isOpen = event.currentTarget.open;
    setOpenSet((prev) => {
      const next = new Set(multiple ? prev : []);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div
      data-cir-component="Accordion"
      data-multiple={multiple ? 'true' : 'false'}
      className={className}
    >
      {items.map((item) => {
        const open = openSet.has(item.id);
        return (
          <details
            key={item.id}
            open={open}
            data-cir-part="accordion-item"
            data-item-id={item.id}
            onToggle={(e): void => {
              onToggle(item.id, e);
            }}
          >
            <summary data-cir-part="accordion-header">{item.header}</summary>
            <div data-cir-part="accordion-content">{item.content}</div>
          </details>
        );
      })}
    </div>
  );
}

Accordion.displayName = 'Accordion';

export function accordionTextRender(props: AccordionProps): string {
  return `[Accordion: ${String(props.items.length)} items]`;
}

export const AccordionBinding: ComponentBinding = {
  id: 'Accordion',
  factory: Accordion,
};
