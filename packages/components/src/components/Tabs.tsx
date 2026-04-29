// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Tabs — uncontrolled tabbed interface. Renders a `<div role="tablist">`
 * with `<button role="tab">` children plus a single `<div role="tabpanel">`
 * for the active tab. Arrow-Left / Arrow-Right cycle focus and selection;
 * Home / End jump to first / last (the conventional WAI-ARIA tabs pattern).
 *
 * Tabs is intentionally uncontrolled here — the active id is internal state
 * with an optional `defaultActiveId` seed. A controlled overload can land in
 * Phase 4c when a manifest layout needs to drive selection from above.
 */
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: readonly TabItem[];
  defaultActiveId?: string;
  className?: string;
}

export function Tabs({ tabs, defaultActiveId, className }: TabsProps): ReactNode {
  const baseId = useId();
  const initial = defaultActiveId ?? tabs[0]?.id ?? '';
  const [activeId, setActiveId] = useState<string>(initial);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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
    if (!target) return;
    setActiveId(target.id);
    buttonRefs.current.get(target.id)?.focus();
  };

  const active = tabs.find((t) => t.id === activeId);

  return (
    <div data-cir-component="Tabs" className={className}>
      <div role="tablist" data-cir-part="tabs-list">
        {tabs.map((t) => {
          const tabBtnId = `${baseId}-tab-${t.id}`;
          const panelId = `${baseId}-panel-${t.id}`;
          const selected = t.id === activeId;
          return (
            <button
              key={t.id}
              ref={(el): void => {
                if (el) buttonRefs.current.set(t.id, el);
                else buttonRefs.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={tabBtnId}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              data-cir-part="tab"
              data-active={selected ? 'true' : 'false'}
              onClick={(): void => {
                setActiveId(t.id);
              }}
              onKeyDown={onKeyDown}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          data-cir-part="tab-panel"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}

Tabs.displayName = 'Tabs';

export function tabsTextRender(props: TabsProps): string {
  return `[Tabs: ${String(props.tabs.length)} tabs]`;
}

export const TabsBinding: ComponentBinding = {
  id: 'Tabs',
  factory: Tabs,
};
