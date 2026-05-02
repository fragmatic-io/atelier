// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * HoverCard — rich-content hover surface for previews, mentions, and
 * @-references.
 *
 * Behaviour (Wave 7b / track Int-13):
 *  - 350ms open delay; 150ms close delay so the user can travel from
 *    trigger → card without it disappearing.
 *  - Hovering the card itself keeps it open (the KEY distinction from
 *    `Tooltip`). Moving from trigger to card cancels the close timer; the
 *    close timer only fires once the pointer leaves both.
 *  - Default width 320px; rich content vs Tooltip's narrow strings.
 *  - `content` may be a `ReactNode` or a thunk `() => ReactNode` — the
 *    thunk is invoked lazily, only when the card is about to open.
 *  - Renders via `createPortal` to `document.body`.
 *  - ESC closes. Click-outside closes.
 *  - ARIA: `role="dialog"`, `aria-label="Preview"` by default. Hosts that
 *    surface mention previews / issue cards / user cards should override
 *    this with the `ariaLabel` prop to a meaningful per-content label
 *    (e.g. `"Issue #CIR-123 preview"` or `"Profile of Vid"`). Empty
 *    string is honoured as an explicit "no label" host signal — distinct
 *    from the default.
 *  - Honours `prefers-reduced-motion: reduce` (skips the opacity fade).
 *  - Smart edge-flip positioning, hand-rolled the same way `Tooltip`
 *    flips: per-axis fit test, single-axis flip if the preferred side
 *    would clip, then a per-axis clamp. Re-implemented (not imported)
 *    so the two components evolve independently.
 *
 * Reference: Linear's #issue cards, Notion's @-mention previews,
 * Raycast's two-pane preview. Pairs with the future Cnt-3 mention /
 * issue auto-resolution work — hover-card is the rendering surface for
 * those previews.
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
import { cn, elevationClass, hoverCardVariantClass, type HoverCardVariant } from './_variants.js';
import { useComponentTransition, type TransitionDuration } from './_transition.js';

export type HoverCardSide = 'top' | 'bottom' | 'left' | 'right';

export interface HoverCardProps {
  /** The trigger element. Must be a single React element so we can clone refs / aria onto it. */
  children: ReactElement;
  /**
   * Card body. Pass a `ReactNode` for eager content, or a thunk
   * `() => ReactNode` to defer building the content until the card is
   * about to open (e.g. a fetch-then-render preview).
   */
  content: ReactNode | (() => ReactNode);
  /** ms before opening on hover. Default 350. */
  openDelay?: number;
  /** ms grace period after pointer leaves both trigger and card. Default 150. */
  closeDelay?: number;
  /** Preferred side. Flips to the opposite side if it would clip the viewport. Default 'bottom'. */
  side?: HoverCardSide;
  /** Gap in px between the trigger and the card. Default 8. */
  offset?: number;
  /** Card width. `'auto'` lets the content size itself. Default 320. */
  width?: number | 'auto';
  /** Visual variant. Default 'default'. */
  variant?: HoverCardVariant;
  /** Class string forwarded to the card. */
  className?: string;
  /**
   * Override the rendered card's `aria-label`. Defaults to `"Preview"`.
   * Hosts that surface mention previews, issue cards, or user cards
   * should pass a per-content label like `"Issue #CIR-123 preview"` or
   * `"Profile of Vid"`. An empty string is honoured as an explicit "no
   * label" host signal (distinct from the default).
   */
  ariaLabel?: string;
  /**
   * Wave 11 / Int-1 — opacity-fade duration for the card body. Defaults
   * to `'fast'` (100ms in the Atelier defaults), matching the
   * pre-Int-1 ad-hoc 100-120ms feel. The OUTER hover detection timings
   * (`openDelay` / `closeDelay`) are independent — those govern when
   * the card opens; this governs how it appears once open.
   */
  duration?: TransitionDuration;
}

interface Position {
  top: number;
  left: number;
  side: HoverCardSide;
}

interface ChildProps {
  ref?: Ref<HTMLElement>;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
}

/**
 * Compute the card's viewport-anchored top/left given the trigger rect,
 * the card's measured rect, the preferred side, and the offset. Flips to
 * the opposite side when the preferred side would clip outside the
 * viewport. Pure: takes only its inputs and the viewport from the
 * caller — re-implemented (not imported from Tooltip) so the two
 * components evolve independently.
 */
export function computeHoverCardPosition(
  trigger: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  },
  card: { width: number; height: number },
  preferredSide: HoverCardSide,
  offset: number,
  viewport: { width: number; height: number },
): Position {
  const fits = (side: HoverCardSide): boolean => {
    if (side === 'top') return trigger.top - card.height - offset >= 0;
    if (side === 'bottom') return trigger.bottom + card.height + offset <= viewport.height;
    if (side === 'left') return trigger.left - card.width - offset >= 0;
    return trigger.right + card.width + offset <= viewport.width;
  };
  const opposite: Readonly<Record<HoverCardSide, HoverCardSide>> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };
  const side: HoverCardSide = fits(preferredSide) ? preferredSide : opposite[preferredSide];

  let top = 0;
  let left = 0;
  if (side === 'top') {
    top = trigger.top - card.height - offset;
    left = trigger.left + trigger.width / 2 - card.width / 2;
  } else if (side === 'bottom') {
    top = trigger.bottom + offset;
    left = trigger.left + trigger.width / 2 - card.width / 2;
  } else if (side === 'left') {
    top = trigger.top + trigger.height / 2 - card.height / 2;
    left = trigger.left - card.width - offset;
  } else {
    top = trigger.top + trigger.height / 2 - card.height / 2;
    left = trigger.right + offset;
  }
  // Clamp into the viewport with a 4px gutter so a centred card never
  // half-falls off the edge.
  const gutter = 4;
  left = Math.max(gutter, Math.min(left, viewport.width - card.width - gutter));
  top = Math.max(gutter, Math.min(top, viewport.height - card.height - gutter));
  return { top, left, side };
}

export function HoverCard({
  children,
  content,
  openDelay = 350,
  closeDelay = 150,
  side = 'bottom',
  offset = 8,
  width = 320,
  variant = 'default',
  className,
  ariaLabel,
  duration = 'fast',
}: HoverCardProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, side });
  /**
   * The resolved content. We snapshot the thunk's return value at open
   * time so the card body remains stable while it is on screen, even if
   * the parent re-renders and would otherwise re-invoke the thunk.
   */
  const [resolvedContent, setResolvedContent] = useState<ReactNode>(null);
  const cardId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSR guard for the portal — we can only target `document.body` on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  const clearOpenTimer = useCallback((): void => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);
  const clearCloseTimer = useCallback((): void => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closeNow = useCallback((): void => {
    clearOpenTimer();
    clearCloseTimer();
    setOpen(false);
  }, [clearOpenTimer, clearCloseTimer]);

  /**
   * Resolve the content lazily. Called only when we are about to open
   * — a thunk is invoked once per open cycle. Eager (non-thunk)
   * content is passed through unchanged.
   */
  const resolveContent = useCallback((): ReactNode => {
    return typeof content === 'function' ? (content as () => ReactNode)() : content;
  }, [content]);

  const scheduleOpen = useCallback((): void => {
    // If a close was pending (because the user briefly left the trigger),
    // cancel it — the card is still open and should stay open.
    clearCloseTimer();
    if (open) return;
    if (openTimer.current !== null) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setResolvedContent(resolveContent());
      setOpen(true);
    }, openDelay);
  }, [clearCloseTimer, open, openDelay, resolveContent]);

  const scheduleClose = useCallback((): void => {
    // If we were waiting to open, cancel the pending open — there's
    // nothing to close.
    clearOpenTimer();
    if (!open) return;
    if (closeTimer.current !== null) return;
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, closeDelay);
  }, [clearOpenTimer, open, closeDelay]);

  // Position recalculation whenever the card appears.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    const t = trigger.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const next = computeHoverCardPosition(
      {
        top: t.top,
        bottom: t.bottom,
        left: t.left,
        right: t.right,
        width: t.width,
        height: t.height,
      },
      { width: c.width, height: c.height },
      side,
      offset,
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPosition(next);
  }, [open, side, offset, resolvedContent]);

  // Outside-click and Escape dismiss.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (cardRef.current?.contains(target)) return;
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
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearOpenTimer, clearCloseTimer]);

  // Wave 11 / Int-1 — opacity ramp via the shared phase machine. The
  // outer 350ms-open / 150ms-close timing controls when the card mounts;
  // the phase machine controls how it appears once mounted. Hook is
  // called BEFORE any conditional return so React's hook order is stable.
  const { style: motionStyle } = useComponentTransition({
    in: open,
    duration,
    enabled: true,
  });

  if (!isValidElement(children)) {
    return children;
  }

  const childProps = children.props as ChildProps;
  const transitionStyle: CSSProperties = motionStyle;

  const cloned = cloneElement(children, {
    ref: (node: HTMLElement | null): void => {
      triggerRef.current = node;
      const existing = (children as unknown as { ref?: Ref<HTMLElement> }).ref;
      if (typeof existing === 'function') existing(node);
      else if (existing && typeof existing === 'object')
        (existing as { current: HTMLElement | null }).current = node;
    },
    'aria-describedby': open ? cardId : childProps['aria-describedby'],
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      scheduleOpen();
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      scheduleClose();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      scheduleOpen();
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      scheduleClose();
    },
  } as Partial<ChildProps>);

  const cardWidthStyle: CSSProperties = width === 'auto' ? {} : { width: `${String(width)}px` };

  const card =
    open && mounted
      ? createPortal(
          <div
            ref={cardRef}
            id={cardId}
            role="dialog"
            aria-label={ariaLabel ?? 'Preview'}
            data-cir-component="HoverCard"
            data-side={position.side}
            data-variant={variant}
            data-elevation="popover"
            className={cn(hoverCardVariantClass[variant], elevationClass.popover, className)}
            style={{
              position: 'fixed',
              top: `${String(position.top)}px`,
              left: `${String(position.left)}px`,
              zIndex: 1000,
              opacity: 1,
              ...cardWidthStyle,
              ...transitionStyle,
            }}
            // Hovering the card itself keeps it open — KEY distinction
            // from Tooltip. Cancels any pending close, schedules a close
            // when the pointer leaves.
            onMouseEnter={() => {
              clearCloseTimer();
            }}
            onMouseLeave={() => {
              scheduleClose();
            }}
          >
            {resolvedContent}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {cloned}
      {card}
    </>
  );
}
HoverCard.displayName = 'HoverCard';

export function hoverCardTextRender(props: Partial<HoverCardProps>): string {
  // The trigger renders independently in text mode; we annotate inline
  // so the chat / voice surface still surfaces the rich preview prose.
  // `content` may be a thunk (lazy) — we never invoke it in text mode
  // since text-render must be cheap and side-effect-free; surface the
  // generic label instead. For string content, surface verbatim.
  const raw = props?.content;
  const text = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '';
  return text.length > 0 ? `[HoverCard: ${text}]` : '[HoverCard]';
}

export const HoverCardBinding: ComponentBinding = { id: 'HoverCard', factory: HoverCard };
