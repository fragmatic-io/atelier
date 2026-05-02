// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors

'use client';
/**
 * Accordion — disclosure group via <details>/<summary>. Variants
 * (Wave 6 / P-10): bordered (default), elevated, ghost, tinted.
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';

export interface AccordionItem {
  id: string;
  header: ReactNode;
  content: ReactNode;
}
export type AccordionVariant = LayoutVariant;

export interface AccordionProps {
  items: readonly AccordionItem[];
  multiple?: boolean;
  defaultOpen?: readonly string[];
  variant?: AccordionVariant;
  className?: string;
}

export function Accordion({
  items,
  multiple = false,
  defaultOpen,
  variant = 'bordered',
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
      data-variant={variant}
      className={cn(layoutVariantClass[variant], className)}
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
export const AccordionBinding: ComponentBinding = { id: 'Accordion', factory: Accordion };
