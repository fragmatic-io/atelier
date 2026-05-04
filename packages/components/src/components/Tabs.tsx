// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors

'use client';
/**
 * Tabs — Radix-backed uncontrolled tabbed interface. Variants (Wave 6 / P-10):
 * bordered, elevated, ghost (default), tinted.
 */
import * as RadixTabs from '@radix-ui/react-tabs';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}
export type TabsVariant = LayoutVariant;

export interface TabsProps {
  tabs: readonly TabItem[];
  defaultActiveId?: string;
  variant?: TabsVariant;
  className?: string;
}

export function Tabs({
  tabs,
  defaultActiveId,
  variant = 'ghost',
  className,
}: TabsProps): ReactNode {
  const initial = defaultActiveId ?? tabs[0]?.id ?? '';
  const [activeId, setActiveId] = useState(initial);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const idx = tabs.findIndex((t) => t.id === activeId);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next];
    if (target) setActiveId(target.id);
  };

  return (
    <RadixTabs.Root
      value={activeId}
      onValueChange={setActiveId}
      data-cir-component="Tabs"
      data-variant={variant}
      className={cn(layoutVariantClass[variant], className)}
    >
      <RadixTabs.List data-cir-part="tabs-list">
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.id}
            value={t.id}
            data-cir-part="tab"
            onClick={() => {
              setActiveId(t.id);
            }}
            onKeyDown={onKeyDown}
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((t) => (
        <RadixTabs.Content key={t.id} value={t.id} data-cir-part="tab-panel">
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
Tabs.displayName = 'Tabs';
export function tabsTextRender(props: TabsProps): string {
  return `[Tabs: ${String(props.tabs.length)} tabs]`;
}
export const TabsBinding: ComponentBinding = { id: 'Tabs', factory: Tabs };
