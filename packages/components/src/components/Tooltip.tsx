// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Tooltip — Radix-backed explanatory hover/focus surface.
 *
 * The public Atelier contract stays intentionally small: one trigger, one
 * content payload, side/offset/timing controls, and host-themeable data parts.
 * Radix owns focus, escape dismissal, portal mounting, collision handling, and
 * the ARIA relationship between trigger and bubble.
 */
import * as RadixTooltip from '@radix-ui/react-tooltip';
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
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, elevationClass, tooltipVariantClass, type TooltipVariant } from './_variants.js';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The trigger element. Must be a single React element so Radix can attach trigger props. */
  children: ReactElement;
  /** Tooltip body. Keep short; it should explain, not replace visible UI. */
  content: ReactNode;
  /** Initial show delay in ms. Default 400. */
  delay?: number;
  /** Re-show delay in ms while scanning adjacent controls. Default 100. */
  rehoverDelay?: number;
  /** Preferred side. Radix may flip/shift to avoid viewport collision. Default 'top'. */
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

interface Position {
  top: number;
  left: number;
  side: TooltipSide;
}

interface ChildProps {
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
}

const STICKY_WINDOW_MS = 1500;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Legacy pure helper retained for downstream tests and callers that validate
 * expected placement. The rendered component now delegates positioning to
 * Radix/Floating UI.
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
  const tooltipId = useId();
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClosedAt = useRef(0);
  const isElement = isValidElement(children);
  const childProps = isElement ? (children.props as ChildProps) : {};

  const clearShowTimer = useCallback((): void => {
    if (showTimer.current !== null) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const closeNow = useCallback((): void => {
    clearShowTimer();
    setOpen((prev) => {
      if (prev) lastClosedAt.current = Date.now();
      return false;
    });
  }, [clearShowTimer]);

  const scheduleOpen = useCallback((): void => {
    clearShowTimer();
    const sinceClose = Date.now() - lastClosedAt.current;
    const baseDelay = sinceClose <= STICKY_WINDOW_MS ? rehoverDelay : delay;
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      setOpen(true);
    }, baseDelay);
  }, [clearShowTimer, delay, rehoverDelay]);

  useEffect(() => clearShowTimer, [clearShowTimer]);

  useEffect(() => {
    if (!open) return;
    const onDown = (): void => {
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

  if (disabled || !isElement) return children;

  const trigger = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      scheduleOpen();
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      if (showTimer.current !== null) {
        clearShowTimer();
        return;
      }
      closeNow();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      scheduleOpen();
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      closeNow();
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onClick?.(e);
      closeNow();
    },
    'aria-describedby': open ? tooltipId : childProps['aria-describedby'],
  } as Partial<ChildProps>);

  const reduceMotion = prefersReducedMotion();
  const transitionStyle: CSSProperties = reduceMotion
    ? {}
    : { transition: 'opacity 100ms ease-in' };

  return (
    <RadixTooltip.Provider delayDuration={delay} skipDelayDuration={rehoverDelay}>
      <RadixTooltip.Root open={open} onOpenChange={setOpen}>
        <RadixTooltip.Trigger asChild>{trigger}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            id={tooltipId}
            sideOffset={offset}
            collisionPadding={4}
            role="tooltip"
            data-cir-component="Tooltip"
            data-variant={variant}
            data-elevation="popover"
            className={cn(tooltipVariantClass[variant], elevationClass.popover, className)}
            style={{
              pointerEvents: 'none',
              ...transitionStyle,
            }}
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
Tooltip.displayName = 'Tooltip';

export function tooltipTextRender(props: Partial<TooltipProps>): string {
  const text = typeof props?.content === 'string' ? props.content : '';
  return text.length > 0 ? `[Tooltip: ${text}]` : '[Tooltip]';
}

export const TooltipBinding: ComponentBinding = { id: 'Tooltip', factory: Tooltip };
