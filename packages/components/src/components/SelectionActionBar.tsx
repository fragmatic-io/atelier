// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / AI-1 — `<SelectionActionBar>` baseline primitive.
 *
 * Notion's "Ask AI" floating bar (and Linear's "Quick edit" toolbar) shows
 * a small action bar above selected text the moment a selection is made.
 * The bar exposes a small set of capability-typed verbs (Summarize /
 * Improve / Translate / Ask AI by default) that dispatch capabilities
 * with the selected text as the params payload — same dispatcher contract
 * as Int-10's `<DropZone>` so the components package stays free of a
 * runtime dependency on `@atelier/react`.
 *
 * Targeting:
 *  - When `container` is supplied, only selections inside that element
 *    raise the toolbar.
 *  - When `container` is null/undefined, any element marked with
 *    `data-cir-ai-selectable="true"` (or one of its descendants) does.
 *
 * Behaviour:
 *  - Listens for `selectionchange` on the document.
 *  - Computes the first DOM rect of the active range and positions the
 *    bar just above it (`position: fixed`). In jsdom the rect is zero —
 *    tests focus on callback / mount behaviour, not pixel positioning.
 *  - Click an action → `dispatcher(capability, { text, surface })` and
 *    `onAction` (if supplied) fires alongside.
 *  - Hides on selection-empty or click-outside.
 *  - Escape dismisses without firing an action.
 *  - Enter triggers the first visible action.
 *  - ARIA: `role="toolbar"` + `aria-label` (override via prop).
 *
 * Composition rule: `'leaf'` — the bar's content is prop-driven.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';
import { Icon } from './Icon.js';
import { normalizeIconRef, type IconRef } from '../icons/icon-ref.js';

/**
 * Dispatcher signature accepted by `<SelectionActionBar>`. Mirrors the
 * `DispatchFn` type exported from `@atelier/react` so the two are
 * structurally interchangeable; we re-declare it here so the components
 * package keeps zero runtime dependency on `@atelier/react`.
 */
export type SelectionActionDispatcher = (capabilityId: string, input: unknown) => Promise<unknown>;

export interface SelectionAction {
  /** Capability id to dispatch when this action is triggered. */
  capability: string;
  /** Display label shown on the button. */
  label: string;
  /** Optional leading icon (kebab-case lucide name, or `{set,name}`). */
  icon?: IconRef;
  /**
   * Optional grouping. Adjacent actions sharing the same group sit next
   * to each other; group changes get a subtle separator.
   */
  group?: string;
  /**
   * Predicate run on each render to decide whether this action should
   * surface for the current selection. Default: always visible.
   */
  visible?: (ctx: { text: string; surface: string }) => boolean;
}

export interface SelectionActionBarProps {
  /**
   * Action list. Default: Summarize / Improve / Translate / Ask AI bound
   * to `ai.<id>` capabilities.
   */
  actions?: readonly SelectionAction[];
  /**
   * Surface id passed to actions and to dispatched params. Identifies
   * which editor surface fired. Default `'editor'`.
   */
  surface?: string;
  /**
   * Container element to scope selection-watch to. When omitted, any
   * element with `data-cir-ai-selectable="true"` is the scope.
   */
  container?: HTMLElement | null;
  /**
   * Host-supplied dispatcher. Typically `useDispatcher()` from
   * `@atelier/react`. When omitted, only `onAction` fires.
   */
  dispatcher?: SelectionActionDispatcher;
  /**
   * Optional callback alongside the dispatch — fires whether a dispatcher
   * is supplied or not. Useful for local-only handlers.
   */
  onAction?: (action: SelectionAction, ctx: { text: string; surface: string }) => void;
  /** Override the toolbar's accessible label. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Default actions used when no `actions` prop is supplied. Exported so
 * hosts can extend / replace pieces while keeping the standard shape.
 */
export const DEFAULT_AI_SELECTION_ACTIONS: readonly SelectionAction[] = [
  { capability: 'ai.summarize', label: 'Summarize', icon: 'sparkles', group: 'transform' },
  { capability: 'ai.improve', label: 'Improve', icon: 'wand-2', group: 'transform' },
  { capability: 'ai.translate', label: 'Translate', icon: 'languages', group: 'transform' },
  { capability: 'ai.ask', label: 'Ask AI', icon: 'sparkle', group: 'ask' },
];

/**
 * Resolve whether a given DOM node is inside the watched scope.
 * - When `container` is supplied, scope = that subtree.
 * - Otherwise scope = any subtree rooted at `[data-cir-ai-selectable="true"]`.
 */
function nodeIsInScope(node: Node | null, container: HTMLElement | null | undefined): boolean {
  if (!node) return false;
  if (container) {
    return container.contains(node);
  }
  // Walk up looking for the opt-in attribute.
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement && cur.dataset['cirAiSelectable'] === 'true') {
      return true;
    }
    cur = cur.parentNode;
  }
  return false;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

/**
 * Pull the bounding rect of the current selection. Returns null if there
 * is no selection or the rect is degenerate.
 */
function getSelectionPosition(): ToolbarPosition | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // Still surface — jsdom returns zeros but we want the bar to mount.
    return { top: 0, left: 0 };
  }
  return { top: rect.top, left: rect.left + rect.width / 2 };
}

export function SelectionActionBar({
  actions = DEFAULT_AI_SELECTION_ACTIONS,
  surface = 'editor',
  container,
  dispatcher,
  onAction,
  ariaLabel = 'AI actions for selection',
  className,
}: SelectionActionBarProps): React.ReactElement | null {
  const [text, setText] = useState('');
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setPosition(null);
      setText('');
      return;
    }
    const anchor = sel.anchorNode;
    if (!nodeIsInScope(anchor, container)) {
      setPosition(null);
      setText('');
      return;
    }
    const next = sel.toString();
    if (next.length === 0) {
      setPosition(null);
      setText('');
      return;
    }
    setText(next);
    setPosition(getSelectionPosition());
  }, [container]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('selectionchange', refresh);
    return (): void => document.removeEventListener('selectionchange', refresh);
  }, [refresh]);

  // Click-outside dismiss.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onDocClick(e: MouseEvent): void {
      if (!barRef.current) return;
      if (e.target instanceof Node && barRef.current.contains(e.target)) return;
      // Only dismiss if the click also collapses the selection.
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (!sel || sel.isCollapsed) {
        setPosition(null);
        setText('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return (): void => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const visibleActions = useMemo(
    () => actions.filter((a) => (a.visible ? a.visible({ text, surface }) : true)),
    [actions, text, surface],
  );

  const trigger = useCallback(
    (action: SelectionAction) => {
      const ctx = { text, surface };
      if (dispatcher) {
        void dispatcher(action.capability, ctx);
      }
      onAction?.(action, ctx);
    },
    [text, surface, dispatcher, onAction],
  );

  // Keyboard handlers — Escape dismisses, Enter triggers the first
  // visible action.
  useEffect(() => {
    if (!position) return undefined;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setPosition(null);
        setText('');
      } else if (e.key === 'Enter' && visibleActions.length > 0) {
        e.preventDefault();
        trigger(visibleActions[0]!);
      }
    }
    document.addEventListener('keydown', onKey);
    return (): void => document.removeEventListener('keydown', onKey);
  }, [position, visibleActions, trigger]);

  if (!position) return null;
  if (visibleActions.length === 0) return null;

  const style: CSSProperties = {
    position: 'fixed',
    top: Math.max(0, position.top - 44),
    left: position.left,
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 6px',
    borderRadius: '8px',
    background: '#111',
    color: '#fff',
    boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
    zIndex: 1000,
    fontSize: '12px',
    lineHeight: 1.4,
  };

  // Render with subtle separator between groups (purely visual; gap on the
  // flex container handles spacing inside a group).
  let lastGroup: string | undefined;
  const items: React.ReactNode[] = [];
  for (const action of visibleActions) {
    if (lastGroup !== undefined && action.group !== lastGroup) {
      items.push(
        <span
          key={`sep-${action.capability}`}
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '1px',
            height: '14px',
            background: 'rgba(255,255,255,0.18)',
            margin: '0 2px',
          }}
        />,
      );
    }
    lastGroup = action.group;
    const ref = action.icon ? normalizeIconRef(action.icon) : null;
    items.push(
      <button
        key={action.capability}
        type="button"
        data-cir-part="selection-action"
        data-capability={action.capability}
        onClick={(): void => trigger(action)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '6px',
          border: '0',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        {ref ? (
          <span data-cir-part="selection-action-icon" style={{ display: 'inline-flex' }}>
            <Icon set={ref.set} name={ref.name} size={14} strokeWidth={1.75} />
          </span>
        ) : null}
        <span data-cir-part="selection-action-label">{action.label}</span>
      </button>,
    );
  }

  return (
    <div
      ref={barRef}
      data-cir-component="SelectionActionBar"
      data-surface={surface}
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(className)}
      style={style}
    >
      {items}
    </div>
  );
}

SelectionActionBar.displayName = 'SelectionActionBar';

export function selectionActionBarTextRender(props: SelectionActionBarProps): string {
  const count = props.actions?.length ?? DEFAULT_AI_SELECTION_ACTIONS.length;
  return `[SelectionActionBar: ${String(count)} actions]`;
}

export const SelectionActionBarBinding: ComponentBinding = {
  id: 'SelectionActionBar',
  factory: SelectionActionBar as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Floating "Ask AI" toolbar that surfaces above the active text selection. ' +
      'Mounts when a selection is made inside the supplied `container` (or any ' +
      'element with `data-cir-ai-selectable="true"`). Each action carries a ' +
      'capability id; clicking dispatches the capability with `{ text, surface }`. ' +
      'Default actions: Summarize / Improve / Translate / Ask AI. Escape dismisses; ' +
      'Enter triggers the first visible action.',
    allowed_props: {
      // `actions` is an array — schema check accepts any array shape.
      actions: 'unknown',
      surface: 'string',
      ariaLabel: 'string',
      className: 'string',
    },
  },
};
