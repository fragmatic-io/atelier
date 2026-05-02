// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Tooltip — Linear-grade hover tip with portal, sticky-window timing, and
 * smart edge-flip positioning.
 *
 * Behaviour (Wave 11 / track Int-2):
 *  - 400ms initial show delay; subsequent re-hovers within a 1500ms sticky
 *    window re-open in 100ms ("snappy when scanning, polite when not" —
 *    Linear / Stripe pattern).
 *  - 8px offset from the trigger (configurable); flips to the opposite
 *    side if the preferred side would clip the tooltip outside the
 *    viewport, with a final per-axis clamp into the viewport.
 *  - 100ms opacity fade-in; honours `prefers-reduced-motion: reduce`.
 *  - Hides on click of the trigger or anywhere outside.
 *  - Keyboard: focus opens (covers `:focus-visible` keyboard tab-in);
 *    Escape closes; `aria-describedby` wires the trigger to the
 *    `role="tooltip"` bubble while open.
 *  - Touch devices: long-press (500ms hold) opens the tooltip; tap
 *    elsewhere dismisses.
 *  - Renders via `createPortal` to `document.body` so `overflow: hidden`
 *    ancestors do not clip the bubble.
 *
 * Pairs with the `tooltip-tone` skill (≤80 chars, no terminal period,
 * never repeats the visible label, never the only path to crucial info).
 *
 * No external positioning deps — we hand-roll the 4-side flip via
 * `getBoundingClientRect` rather than pulling in Floating UI's middleware
 * stack. Trade-off: no shift/arrow/auto-update; for a single tooltip on a
 * mostly-static layout that's a fine bargain.
 */
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, elevationClass, tooltipVariantClass, type TooltipVariant } from './_variants.js';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The trigger element. Must be a single React element so we can clone refs / aria onto it. */
  children: ReactElement;
  /** Tooltip body. Keep ≤80 chars per the `tooltip-tone` skill. */
  content: ReactNode;
  /** Initial show delay in ms. Default 400. */
  delay?: number;
  /** Re-show delay in ms while inside the 1500ms sticky window. Default 100. */
  rehoverDelay?: number;
  /** Preferred side. Flips to the opposite side if it would clip the viewport. Default 'top'. */
  side?: TooltipSide;
  /** Gap in px between the trigger and the tooltip. Default 8. */
  offset?: number;
  /** When true, the tooltip never opens. */
  disabled?: boolean;
  /** Visual variant. Default 'default' (dark surface). */
  variant?: TooltipVariant;
  /** Class string forwarded to the bubble. */
  className?: string;
}

/** ms within which a second hover counts as "re-hover" (sticky window). */
const STICKY_WINDOW_MS = 1500;
/** ms a touch must be held before the tooltip opens. */
const LONG_PRESS_MS = 500;

interface Position {
  top: number;
  left: number;
  side: TooltipSide;
}

interface ChildProps {
  ref?: Ref<HTMLElement>;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onTouchStart?: (e: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd?: (e: React.TouchEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Compute the tooltip's viewport-anchored top/left given the trigger rect,
 * the bubble's measured rect, the preferred side, and the offset. Flips
 * to the opposite side when the preferred side would clip outside the
 * viewport. Pure: takes only its inputs and `window` size from the caller.
 */
export function computeTooltipPosition(
  trigger: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  },
  bubble: { width: number; height: number },
  preferredSide: TooltipSide,
  offset: number,
  viewport: { width: number; height: number },
): Position {
  // Determine final side via single-axis flip — if the preferred side does
  // not fit within the viewport, try the opposite. We never collapse onto
  // the perpendicular axis (left/right ↔ top/bottom) because that changes
  // the relationship between the trigger and the bubble.
  const fits = (side: TooltipSide): boolean => {
    if (side === 'top') return trigger.top - bubble.height - offset >= 0;
    if (side === 'bottom') return trigger.bottom + bubble.height + offset <= viewport.height;
    if (side === 'left') return trigger.left - bubble.width - offset >= 0;
    return trigger.right + bubble.width + offset <= viewport.width;
  };
  const opposite: Readonly<Record<TooltipSide, TooltipSide>> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };
  const side: TooltipSide = fits(preferredSide) ? preferredSide : opposite[preferredSide];

  let top = 0;
  let left = 0;
  if (side === 'top') {
    top = trigger.top - bubble.height - offset;
    left = trigger.left + trigger.width / 2 - bubble.width / 2;
  } else if (side === 'bottom') {
    top = trigger.bottom + offset;
    left = trigger.left + trigger.width / 2 - bubble.width / 2;
  } else if (side === 'left') {
    top = trigger.top + trigger.height / 2 - bubble.height / 2;
    left = trigger.left - bubble.width - offset;
  } else {
    top = trigger.top + trigger.height / 2 - bubble.height / 2;
    left = trigger.right + offset;
  }
  // Clamp into the viewport so a centred bubble never half-falls off the
  // edge. The clamp is per-axis and keeps a 4px gutter from the edge.
  const gutter = 4;
  left = Math.max(gutter, Math.min(left, viewport.width - bubble.width - gutter));
  top = Math.max(gutter, Math.min(top, viewport.height - bubble.height - gutter));
  return { top, left, side };
}

export function Tooltip({
  children,
  content,
  delay = 400,
  rehoverDelay = 100,
  side = 'top',
  offset = 8,
  disabled = false,
  variant = 'default',
  className,
}: TooltipProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, side });
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timestamp of the most recent close. Used to detect "re-hover within sticky window". */
  const lastClosedAt = useRef<number>(0);

  // SSR guard for the portal — we can only target `document.body` on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  const clearShowTimer = useCallback((): void => {
    if (showTimer.current !== null) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);
  const clearLongPress = useCallback((): void => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const closeNow = useCallback((): void => {
    clearShowTimer();
    clearLongPress();
    setOpen((prev) => {
      if (prev) lastClosedAt.current = Date.now();
      return false;
    });
  }, [clearShowTimer, clearLongPress]);

  const scheduleOpen = useCallback(
    (kind: 'pointer' | 'touch'): void => {
      if (disabled) return;
      clearShowTimer();
      const sinceClose = Date.now() - lastClosedAt.current;
      const baseDelay =
        kind === 'touch' ? LONG_PRESS_MS : sinceClose <= STICKY_WINDOW_MS ? rehoverDelay : delay;
      showTimer.current = setTimeout(() => {
        showTimer.current = null;
        setOpen(true);
      }, baseDelay);
    },
    [clearShowTimer, delay, rehoverDelay, disabled],
  );

  // Position recalculation whenever the bubble appears.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const t = trigger.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const next = computeTooltipPosition(
      {
        top: t.top,
        bottom: t.bottom,
        left: t.left,
        right: t.right,
        width: t.width,
        height: t.height,
      },
      { width: b.width, height: b.height },
      side,
      offset,
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPosition(next);
  }, [open, side, offset, content]);

  // Outside-click and Escape dismiss.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (bubbleRef.current?.contains(target)) return;
      closeNow();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeNow();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closeNow]);

  // Cleanup on unmount.
  useEffect(() => {
    return (): void => {
      clearShowTimer();
      clearLongPress();
    };
  }, [clearShowTimer, clearLongPress]);

  if (!isValidElement(children)) {
    // We need a single element to clone refs/aria onto. If a non-element was
    // passed (e.g. plain text), render the children inert without a tooltip.
    return children;
  }

  const childProps = children.props as ChildProps;
  const reduceMotion = prefersReducedMotion();
  const transitionStyle: CSSProperties = reduceMotion
    ? {}
    : { transition: 'opacity 100ms ease-in' };

  const cloned = cloneElement(children, {
    ref: (node: HTMLElement | null): void => {
      triggerRef.current = node;
      // Forward to any pre-existing ref the consumer attached.
      const existing = (children as unknown as { ref?: Ref<HTMLElement> }).ref;
      if (typeof existing === 'function') existing(node);
      else if (existing && typeof existing === 'object')
        (existing as { current: HTMLElement | null }).current = node;
    },
    'aria-describedby': open ? tooltipId : childProps['aria-describedby'],
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      scheduleOpen('pointer');
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      // If we were waiting to show, cancel the pending show. Otherwise close.
      if (showTimer.current !== null) {
        clearShowTimer();
        return;
      }
      closeNow();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      scheduleOpen('pointer');
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      closeNow();
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onClick?.(e);
      // Clicking the trigger always dismisses an open tooltip — keeps it
      // out of the way of the next interaction (per the tooltip-tone skill).
      closeNow();
    },
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      childProps.onTouchStart?.(e);
      scheduleOpen('touch');
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      childProps.onTouchEnd?.(e);
      // If the long-press never fired, treat the touch as a tap and cancel
      // the pending show. If it did fire and the tooltip is open, leave
      // dismissal to the outside-tap handler so the user can read it.
      if (showTimer.current !== null) clearShowTimer();
    },
  } as Partial<ChildProps>);

  const bubble =
    open && mounted
      ? createPortal(
          <div
            ref={bubbleRef}
            id={tooltipId}
            role="tooltip"
            data-cir-component="Tooltip"
            data-side={position.side}
            data-variant={variant}
            data-elevation="popover"
            className={cn(tooltipVariantClass[variant], elevationClass.popover, className)}
            style={{
              position: 'fixed',
              top: `${String(position.top)}px`,
              left: `${String(position.left)}px`,
              zIndex: 1000,
              opacity: 1,
              pointerEvents: 'none',
              ...transitionStyle,
            }}
          >
            {content}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {cloned}
      {bubble}
    </>
  );
}
Tooltip.displayName = 'Tooltip';

export function tooltipTextRender(props: Partial<TooltipProps>): string {
  // The trigger renders independently in text mode; we annotate inline so
  // the chat / voice surface still surfaces the explanatory prose.
  const text = typeof props?.content === 'string' ? props.content : '';
  return text.length > 0 ? `[Tooltip: ${text}]` : '[Tooltip]';
}

export const TooltipBinding: ComponentBinding = { id: 'Tooltip', factory: Tooltip };
