// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors

'use client';
/**
 * Toast — controlled transient announcement.
 *
 * Variants:
 *  - `info` (default), `success`, `warning`, `error` — the Wave 6 / P-10
 *    severity variants. `severity` is a legacy alias for `variant`.
 *  - `undo` — Wave 11 / Int-8. A dark high-contrast toast with a countdown
 *    progress bar and an `Undo` action button. Pair with the `withUndo()`
 *    middleware (`@atelier/runtime`) and `useUndoToastEmitter()` (`@atelier/react`)
 *    for the full reversible-action affordance Linear / Gmail ship.
 *
 * `variant="undo"` props:
 *  - `windowMs` — total open window in ms (default 5000). Drives both the
 *    auto-dismiss timer AND the visual progress bar.
 *  - `onUndo` — called when the user clicks the Undo button. The Toast
 *    closes itself synchronously after the callback fires.
 *  - `onDismiss` — called when the user closes the toast manually (or when
 *    the window expires). Distinct from `onClose` so hosts can audit
 *    dismissal vs. expiry separately. Optional; falls back to `onClose`.
 *  - `dismissible` — whether to render the close affordance. Default true.
 *  - `actionLabel` — text on the Undo button. Default `Undo`.
 *
 * Wave 11 / Int-1 — opt-in entry/exit transition. When `animated` is set,
 * the toast slides up from `translateY(8px)` with an opacity ramp on entry,
 * and reverses on close. Defaults to off for back-compat. Distinct from
 * the undo countdown — the countdown drives the progress bar, the
 * transition drives the open/close visual.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import type { AlertSeverity } from './Alert.js';
import { cn, toastVariantClass, type ToastVariant } from './_variants.js';
import { useComponentTransition, type TransitionDuration } from './_transition.js';

export type { ToastVariant };

export interface ToastProps {
  message: string;
  open: boolean;
  onClose: () => void;
  severity?: AlertSeverity;
  variant?: ToastVariant;
  duration?: number;
  className?: string;
  /** Wave 11 / Int-8 — undo-window length in ms. Used when `variant === 'undo'`. */
  windowMs?: number;
  /** Wave 11 / Int-8 — fired when the user clicks the Undo button. */
  onUndo?: () => void;
  /** Wave 11 / Int-8 — fired when the toast is dismissed (manual or expiry). */
  onDismiss?: () => void;
  /** Wave 11 / Int-8 — show / hide the close affordance. Default true. */
  dismissible?: boolean;
  /** Wave 11 / Int-8 — label on the Undo button. Default `Undo`. */
  actionLabel?: string;
  /**
   * Wave 11 / Int-1 — when true, the toast animates entry (slide up
   * from `translateY(8px)` + opacity 0 → 1) and exit (reverse). Defaults
   * to false for back-compat. Honours `prefers-reduced-motion`.
   * Distinct from the `undo` countdown timer.
   */
  animated?: boolean;
  /**
   * Wave 11 / Int-1 — entry/exit duration override. Names from the
   * brand kit scale OR raw ms. Defaults to `'normal'`.
   */
  transitionDuration?: TransitionDuration;
}

export function Toast({
  message,
  open,
  onClose,
  severity,
  variant,
  duration = 4000,
  className,
  windowMs,
  onUndo,
  onDismiss,
  dismissible = true,
  actionLabel = 'Undo',
  animated = false,
  transitionDuration,
}: ToastProps): ReactNode {
  const v: ToastVariant = variant ?? severity ?? 'info';
  const isUndo = v === 'undo';
  // For undo toasts, the auto-dismiss is driven by `windowMs` (the
  // capability-declared window), not the generic `duration`. For other
  // variants, fall through to the historical `duration` contract.
  const effectiveDuration = isUndo ? (windowMs ?? 5000) : duration;

  // Wave 11 / Int-1 — entry/exit transition. Independent of the undo
  // countdown; this controls the open/close visual lifecycle.
  const {
    phase,
    style: motionStyle,
    reducedMotion,
  } = useComponentTransition({
    in: open,
    enabled: animated,
    ...(transitionDuration !== undefined ? { duration: transitionDuration } : {}),
  });

  // Countdown state — driven off a tick interval so the progress bar
  // animates smoothly. We compare against a start-time ref so React
  // StrictMode's double-mount in dev does not cut the window in half.
  const [remainingMs, setRemainingMs] = useState<number>(effectiveDuration);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      startedAt.current = null;
      setRemainingMs(effectiveDuration);
      return;
    }
    if (effectiveDuration <= 0) return;

    startedAt.current = Date.now();
    setRemainingMs(effectiveDuration);

    if (!isUndo) {
      // Non-undo path: just fire onClose at the end of the duration.
      const id = setTimeout(() => {
        onClose();
      }, effectiveDuration);
      return (): void => {
        clearTimeout(id);
      };
    }

    // Undo path: tick every 100ms, expire by calling onDismiss (or onClose)
    // when the window closes. Hosts that mount this for >5s would see a
    // 50-frame animation — fine for the bounded window budget.
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = (): void => {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      const next = Math.max(0, effectiveDuration - elapsed);
      setRemainingMs(next);
      if (next <= 0) {
        if (interval !== null) clearInterval(interval);
        (onDismiss ?? onClose)();
      }
    };
    interval = setInterval(tick, 100);
    return (): void => {
      if (interval !== null) clearInterval(interval);
    };
  }, [open, effectiveDuration, isUndo, onClose, onDismiss]);

  // The toast must stay mounted through the exit animation when animated.
  const visible = animated ? phase !== 'exited' : open;
  if (!visible) return null;
  const role = v === 'error' || v === 'warning' ? 'alert' : 'status';
  // Per-component motion grammar: slide-up-from-bottom transform layered
  // on top of the shared opacity/transition style.
  const transformStyle: CSSProperties =
    animated && !reducedMotion
      ? { transform: phase === 'entered' ? 'translateY(0)' : 'translateY(8px)' }
      : {};
  const combinedMotionStyle: CSSProperties = animated ? { ...motionStyle, ...transformStyle } : {};
  const animatedAttrs: Readonly<Record<string, string>> = animated
    ? { 'data-transition-phase': phase, 'data-animated': 'true' }
    : {};

  if (isUndo) {
    const pct =
      effectiveDuration > 0
        ? Math.max(0, Math.min(100, (remainingMs / effectiveDuration) * 100))
        : 0;
    return (
      <output
        role={role}
        aria-live="polite"
        data-cir-component="Toast"
        data-severity={v}
        data-variant={v}
        {...animatedAttrs}
        className={cn(
          toastVariantClass[v],
          'rounded-md shadow-lg flex items-stretch overflow-hidden',
          className,
        )}
        style={{
          position: 'fixed',
          right: '16px',
          bottom: '16px',
          minWidth: '280px',
          ...combinedMotionStyle,
        }}
      >
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 text-sm">{message}</span>
            {onUndo && (
              <button
                type="button"
                data-cir-undo-button="true"
                onClick={() => {
                  onUndo();
                  onClose();
                }}
                className="text-sm font-medium underline underline-offset-2 hover:no-underline"
              >
                {actionLabel}
              </button>
            )}
            {dismissible && (
              <button
                type="button"
                data-cir-dismiss-button="true"
                aria-label="Dismiss"
                onClick={() => {
                  (onDismiss ?? onClose)();
                  if (onDismiss) onClose();
                }}
                className="text-sm opacity-70 hover:opacity-100"
              >
                ×
              </button>
            )}
          </div>
          <div
            data-cir-undo-progress="true"
            aria-hidden="true"
            className="h-1 bg-white/10 dark:bg-black/10"
          >
            <div
              className="h-full bg-white/60 dark:bg-black/60 transition-[width] duration-100 ease-linear"
              style={{ width: `${String(pct)}%` }}
            />
          </div>
        </div>
      </output>
    );
  }

  return (
    <output
      role={role}
      aria-live="polite"
      data-cir-component="Toast"
      data-severity={v}
      data-variant={v}
      {...animatedAttrs}
      className={cn(toastVariantClass[v], className)}
      style={{ position: 'fixed', right: '16px', bottom: '16px', ...combinedMotionStyle }}
    >
      {message}
    </output>
  );
}
Toast.displayName = 'Toast';
export function toastTextRender(props: ToastProps): string {
  const v = props.variant ?? props.severity ?? 'info';
  return `[Toast(${String(v)}): ${props.message}]`;
}
export const ToastBinding: ComponentBinding = { id: 'Toast', factory: Toast };
