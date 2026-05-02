// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * BulkActionBar — Linear-grade floating action bar that docks at the bottom
 * of the viewport while a multi-select is active.
 *
 * Behaviour (Wave 7b / track Int-9):
 *  - Visible only when `selectionCount >= 1`.
 *  - Position: `fixed`, bottom-center, ~16px above the viewport edge,
 *    rendered through `createPortal` to `document.body` so an overflowing
 *    list ancestor cannot clip it.
 *  - Slide-up entry / slide-down exit, ~140ms; honours
 *    `prefers-reduced-motion: reduce` (skips both transition and transform).
 *  - Esc clears the selection (hosts pass `onClear`). When a
 *    `<KeyboardProvider>` (Wave 11 / Int-3) is in scope we register a scoped
 *    `bulk.clear` action so palettes can discover the shortcut and chord /
 *    alias overrides (Int-7) can rebind it; otherwise we fall back to a
 *    direct `keydown` listener so the shortcut still works in unwrapped
 *    hosts. Either way, users learn one shortcut that works everywhere.
 *  - Buttons are tagged with `data-variant="destructive"` for hosts that
 *    style on `data-variant`; the utility-class string also flips so
 *    Tailwind hosts get red styling for free.
 *
 * Pairs with the `bulk-edit-affordance` skill — selection promises an
 * action set, so the bar always shows the count up-front (never nests it
 * inside a kebab menu).
 *
 * No external positioning deps; the bar is a single fixed element with a
 * Tailwind-friendly utility class string from `_variants.ts`.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ComponentBinding } from '@atelier/runtime';
import { useKeyboard } from '../keyboard/hooks.js';
import {
  bulkActionBarVariantClass,
  cn,
  elevationClass,
  type BulkActionBarVariant,
} from './_variants.js';

/**
 * One entry in the bulk action set. The id is the capability id (e.g.
 * `github.issue.bulk_close`) so a host can route the click straight into
 * the action dispatcher; we keep the component dumb and forward via
 * `onAction(id)`.
 */
export interface BulkAction {
  /** Capability id (e.g. `github.issue.bulk_close`). Returned to `onAction`. */
  id: string;
  /** Visible label on the button. */
  label: string;
  /** Visual emphasis. `destructive` triggers a red surface. Default `default`. */
  variant?: 'default' | 'destructive';
  /** Optional icon — opaque to this component; hosts read `set` + `name`. */
  icon?: { set: string; name: string };
  /** Confirmation flavour the host should escalate to. Mirrors `Capability.confirmation`. */
  confirmation?: 'none' | 'inline' | 'modal' | 'verbal_required';
}

export interface BulkActionBarProps {
  /** Number of currently-selected rows. The bar is hidden when this is 0. */
  selectionCount: number;
  /** Bulk actions to surface as buttons. Order is preserved. */
  actions: readonly BulkAction[];
  /** Click handler for an action button. Receives the action's id. */
  onAction: (actionId: string) => void;
  /** Called on Esc, click of the close (×) button, or any host-driven clear. */
  onClear: () => void;
  /** Optional class string forwarded to the bar's outer element. */
  className?: string;
  /** Visual variant. Reserved for future extension; only `default` ships today. */
  variant?: BulkActionBarVariant;
  /**
   * Manifest-driven primary capability dispatcher (Phase 2 #2). When a
   * manifest declares `actions: [...]` on a `BulkActionBar` node, the
   * render-node wires the first capability to this slot. The bar surfaces
   * it through `onAction(id)` for any action whose `id` matches the
   * declared capability, so hosts that route bulk-action clicks through
   * the framework dispatcher have a stable, DOM-safe prop name.
   *
   * Most hosts use the existing `onAction` + capability lookup pattern and
   * leave this unset; it's declared so the binding can advertise an
   * `actionSlots` entry for the contract.
   */
  onPrimaryAction?: (input?: unknown) => unknown;
  /** Optional secondary capability dispatcher; second `actions[]` entry. */
  onSecondaryAction?: (input?: unknown) => unknown;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const DESTRUCTIVE_BUTTON_CLASS =
  'bg-red-600 text-white hover:bg-red-700 rounded-md px-3 py-1.5 dark:bg-red-500 dark:hover:bg-red-400';
const DEFAULT_BUTTON_CLASS =
  'bg-white/10 text-white hover:bg-white/20 rounded-md px-3 py-1.5 dark:bg-black/10 dark:text-gray-900 dark:hover:bg-black/20';

export function BulkActionBar({
  selectionCount,
  actions,
  onAction,
  onClear,
  className,
  variant = 'default',
  // Declared for the actionSlots contract; not consumed by the bar itself
  // — the existing `onAction` + per-action `id` flow is preserved.
  onPrimaryAction: _onPrimaryAction,
  onSecondaryAction: _onSecondaryAction,
}: BulkActionBarProps): ReactNode {
  const labelId = useId();
  const [mounted, setMounted] = useState(false);

  // SSR guard — the portal can only target `document.body` after mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Wave 11 / Int-9 + Int-3 — Esc-to-clear. When a `<KeyboardProvider>` is
  // in scope, register a scoped `bulk.clear` action with the registry so
  // palettes can discover the shortcut and chord / alias overrides (Int-7)
  // can rebind it. When no provider is present we fall back to a direct
  // `window.keydown` listener so the shortcut still works in unwrapped
  // hosts. The action is only live while `selectionCount >= 1` — outside
  // that window we unregister so global Esc (close modal, dismiss tooltip)
  // is not intercepted. Stable `onClear` ref so we don't re-register on
  // every parent render that hands a new closure.
  const services = useKeyboard();
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;
  const isVisible = selectionCount >= 1;
  useEffect(() => {
    if (!services) return;
    if (!isVisible) return;
    const unregister = services.registry.register({
      id: 'bulk.clear',
      label: 'Clear bulk selection',
      description: 'Clear the active bulk-action selection',
      hotkey: 'Escape',
      scope: 'route',
      group: 'Edit',
      invoke: () => onClearRef.current(),
    });
    return (): void => {
      unregister();
    };
  }, [services, isVisible]);

  useEffect(() => {
    // Fallback path — no `<KeyboardProvider>` in scope. Bind a `window`
    // keydown listener for the lifetime the bar is visible. Mirrors the
    // pre-Int-3 behaviour so unwrapped hosts still get Esc-to-clear.
    if (services) return;
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClearRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [services, isVisible]);

  const handleAction = useCallback(
    (id: string) => {
      return (): void => {
        onAction(id);
      };
    },
    [onAction],
  );

  if (selectionCount < 1) return null;
  if (!mounted) return null;

  const reduceMotion = prefersReducedMotion();
  const transitionStyle: CSSProperties = reduceMotion
    ? {}
    : {
        transition: 'transform 140ms ease-out, opacity 140ms ease-out',
        transform: 'translate(-50%, 0)',
        opacity: 1,
      };

  const itemNoun = selectionCount === 1 ? 'item' : 'items';
  const ariaLabel = `Bulk action bar — ${String(selectionCount)} ${itemNoun} selected`;

  const bar = (
    <section
      role="region"
      aria-label={ariaLabel}
      aria-labelledby={labelId}
      data-cir-component="BulkActionBar"
      data-variant={variant}
      data-reduce-motion={reduceMotion ? 'true' : 'false'}
      data-elevation="popover"
      className={cn(bulkActionBarVariantClass[variant], elevationClass.popover, className)}
      style={transitionStyle}
    >
      <span
        id={labelId}
        data-cir-part="bulk-count"
        aria-live="polite"
      >{`${String(selectionCount)} selected`}</span>
      <div data-cir-part="bulk-actions" role="group" aria-label="Bulk actions">
        {actions.map((action) => {
          const isDestructive = action.variant === 'destructive';
          const buttonClass = isDestructive ? DESTRUCTIVE_BUTTON_CLASS : DEFAULT_BUTTON_CLASS;
          return (
            <button
              key={action.id}
              type="button"
              data-cir-part="bulk-action"
              data-action-id={action.id}
              data-variant={action.variant ?? 'default'}
              data-confirmation={action.confirmation ?? 'none'}
              aria-label={`${action.label} ${String(selectionCount)} ${itemNoun}`}
              className={buttonClass}
              onClick={handleAction(action.id)}
            >
              {action.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        data-cir-part="bulk-close"
        aria-label="Clear selection"
        className="bg-transparent text-white/70 hover:text-white rounded-md px-2 dark:text-gray-900/70 dark:hover:text-gray-900"
        onClick={onClear}
      >
        ×
      </button>
    </section>
  );

  return createPortal(bar, document.body);
}
BulkActionBar.displayName = 'BulkActionBar';

/**
 * Text-render fallback. Null-safe — the renderer manifest may pass partial
 * props during dry-run / preview flows, so we tolerate missing fields.
 */
export function bulkActionBarTextRender(props: Partial<BulkActionBarProps>): string {
  const count = typeof props?.selectionCount === 'number' ? props.selectionCount : 0;
  const labels = (props?.actions ?? []).map((a) => a.label).filter((s) => s.length > 0);
  if (count < 1) return '[BulkActionBar: idle]';
  const noun = count === 1 ? 'item' : 'items';
  const actions = labels.length > 0 ? ` — ${labels.join(', ')}` : '';
  return `[BulkActionBar: ${String(count)} ${noun} selected${actions}]`;
}

export const BulkActionBarBinding: ComponentBinding = {
  id: 'BulkActionBar',
  factory: BulkActionBar as ComponentBinding['factory'],
  actionSlots: ['onPrimaryAction', 'onSecondaryAction'],
};
