// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * TourStep — contextual highlight ring + tooltip card around a target
 * element. The host orchestrates which step shows; this primitive owns
 * the overlay + positioning + footer controls.
 *
 * Wave 11 / Int-5 — onboarding microinteractions. Pairs with
 * `<TourProgress>` (the dots/bar/fraction strip) and the host's tour
 * data. Tour data shape is intentionally NOT a Atelier schema — different
 * hosts model "what's a tour step" radically differently (Linear's are
 * issue-bound, Stripe's are setup-checklist-bound, etc.). We ship the
 * baseline UI affordance and stay out of the data model.
 *
 * Behaviour:
 *  - Resolves `target` (CSS selector OR element ref) on every open and
 *    on window resize. Falls back to centre-of-viewport if the element
 *    is missing — the tour shouldn't blow up on a transient routing
 *    change.
 *  - Draws a translucent overlay around the rest of the page via the
 *    box-shadow cutout trick (`box-shadow: 0 0 0 9999px rgba(...)`).
 *  - Tooltip card carries title / description / footer with
 *    `<TourProgress>` + Skip / Prev / Next buttons. The Next button on
 *    the last step labels itself "Done" and calls `onComplete` instead.
 *  - Reduced-motion: snap into position, no entrance animation.
 *  - Keyboard: Escape calls `onSkip`; Enter advances; Tab focus-traps
 *    inside the card. The card mounts with the Next/Done button focused
 *    so a "press Enter to continue" flow works without any extra setup.
 *
 * Composition role: leaf — the card is rendered from props; manifest
 * authors do not embed children inside `<TourStep>`.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { isReducedMotion, type ComponentBinding } from '@atelier/runtime';
import { cn, elevationClass } from './_variants.js';
import { TourProgress } from './TourProgress.js';

export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStepProps {
  /** CSS selector OR element to highlight. */
  target: string | HTMLElement;
  /** Step title shown at the top of the card. */
  title: string;
  /** Optional supporting copy under the title. */
  description?: string;
  /** 1-indexed step number. */
  step: number;
  /** Total number of steps. */
  totalSteps: number;
  /** Fired when the Next button is clicked AND we are not on the last step. */
  onNext?: () => void;
  /** Fired when the Prev button is clicked. Hidden on step 1. */
  onPrev?: () => void;
  /** Fired when Skip is clicked OR Escape is pressed. */
  onSkip?: () => void;
  /** Fired when the Done button is clicked on the LAST step. */
  onComplete?: () => void;
  /** Preferred placement. `'auto'` flips into the side with the most room. Default `'auto'`. */
  placement?: TourStepPlacement;
  /** Controlled visibility. Default true. Pass false to hide without unmounting. */
  open?: boolean;
  /** ARIA label override for the card. Default `"Tour step"`. */
  ariaLabel?: string;
  /** Forwarded to the card surface. */
  className?: string;
}

interface CardPosition {
  top: number;
  left: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

/** Card padding + arrow gutter; matches `Tooltip` / `HoverCard`. */
const CARD_OFFSET_PX = 12;
/** Default card width. Wide enough for two short paragraphs. */
const CARD_WIDTH_PX = 320;
/** Highlight ring radius around the target rect. */
const RING_PADDING_PX = 6;
const RING_RADIUS_PX = 6;
/** Viewport gutter so the card never half-falls off the edge. */
const GUTTER_PX = 8;

/**
 * Resolve the `target` prop into a DOMRect (or null if it's not on the
 * page yet). Selector strings query the live DOM; HTMLElement refs use
 * `getBoundingClientRect` directly. Caller passes `documentRoot` so tests
 * with detached fragments still work.
 */
export function resolveTargetRect(
  target: string | HTMLElement,
  documentRoot: Document = document,
): DOMRect | null {
  let el: HTMLElement | null = null;
  if (typeof target === 'string') {
    try {
      el = documentRoot.querySelector(target);
    } catch {
      return null;
    }
  } else {
    el = target;
  }
  if (!el) return null;
  if (typeof el.getBoundingClientRect !== 'function') return null;
  return el.getBoundingClientRect();
}

/**
 * Pick a placement when the host asked for `'auto'`: choose the side
 * with the most room around the target rect within the viewport.
 */
export function pickAutoPlacement(
  target: { top: number; bottom: number; left: number; right: number },
  viewport: { width: number; height: number },
): 'top' | 'bottom' | 'left' | 'right' {
  const room = {
    top: target.top,
    bottom: viewport.height - target.bottom,
    left: target.left,
    right: viewport.width - target.right,
  };
  let best: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
  let bestRoom = room.bottom;
  if (room.top > bestRoom) {
    best = 'top';
    bestRoom = room.top;
  }
  if (room.right > bestRoom) {
    best = 'right';
    bestRoom = room.right;
  }
  if (room.left > bestRoom) {
    best = 'left';
    bestRoom = room.left;
  }
  return best;
}

/**
 * Compute the card's viewport-anchored top/left given the target rect, the
 * card's measured rect, the resolved side, and the offset. Per-axis clamp
 * keeps the card on-screen.
 */
export function computeCardPosition(
  target: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  },
  card: { width: number; height: number },
  side: 'top' | 'bottom' | 'left' | 'right',
  offset: number,
  viewport: { width: number; height: number },
): CardPosition {
  let top = 0;
  let left = 0;
  if (side === 'top') {
    top = target.top - card.height - offset;
    left = target.left + target.width / 2 - card.width / 2;
  } else if (side === 'bottom') {
    top = target.bottom + offset;
    left = target.left + target.width / 2 - card.width / 2;
  } else if (side === 'left') {
    top = target.top + target.height / 2 - card.height / 2;
    left = target.left - card.width - offset;
  } else {
    top = target.top + target.height / 2 - card.height / 2;
    left = target.right + offset;
  }
  left = Math.max(GUTTER_PX, Math.min(left, viewport.width - card.width - GUTTER_PX));
  top = Math.max(GUTTER_PX, Math.min(top, viewport.height - card.height - GUTTER_PX));
  return { top, left, side };
}

/** Centre-of-viewport fallback when the target is not on the page. */
function centreOfViewportRect(viewport: { width: number; height: number }): DOMRect {
  const w = 1;
  const h = 1;
  const rect = {
    top: viewport.height / 2 - h / 2,
    bottom: viewport.height / 2 + h / 2,
    left: viewport.width / 2 - w / 2,
    right: viewport.width / 2 + w / 2,
    width: w,
    height: h,
    x: viewport.width / 2,
    y: viewport.height / 2,
    toJSON: (): unknown => ({}),
  };
  return rect;
}

/**
 * Tab focus-trap inside the given root. Cycles between the first and last
 * focusable element in `root`. Pure-ish — reads the live DOM, no side
 * effects beyond focus changes.
 */
function trapTabKey(e: KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== 'Tab' || !root) return;
  const focusables = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const active = root.ownerDocument?.activeElement;
  if (e.shiftKey) {
    if (active === first || !root.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    e.preventDefault();
    first.focus();
  }
}

export function TourStep({
  target,
  title,
  description,
  step,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onComplete,
  placement = 'auto',
  open = true,
  ariaLabel,
  className,
}: TourStepProps): ReactNode {
  const cardId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<CardPosition>({ top: 0, left: 0, side: 'bottom' });
  const reducedMotion = useMemo<boolean>(() => isReducedMotion(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLast = step >= totalSteps;
  const isFirst = step <= 1;

  const handleNext = useCallback((): void => {
    if (isLast) {
      onComplete?.();
    } else {
      onNext?.();
    }
  }, [isLast, onComplete, onNext]);

  const handleSkip = useCallback((): void => {
    onSkip?.();
  }, [onSkip]);

  const handlePrev = useCallback((): void => {
    onPrev?.();
  }, [onPrev]);

  // Resolve target + reposition. Re-run on step / target / placement change
  // and on resize / scroll events while open.
  useEffect(() => {
    if (!open || !mounted) return undefined;
    const recompute = (): void => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const rect = resolveTargetRect(target) ?? centreOfViewportRect(viewport);
      setTargetRect(rect);
      const cardEl = cardRef.current;
      const cardSize = cardEl
        ? { width: cardEl.offsetWidth || CARD_WIDTH_PX, height: cardEl.offsetHeight || 120 }
        : { width: CARD_WIDTH_PX, height: 120 };
      const side = placement === 'auto' ? pickAutoPlacement(rect, viewport) : placement;
      const next = computeCardPosition(
        {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
        cardSize,
        side,
        CARD_OFFSET_PX,
        viewport,
      );
      setCardPos(next);
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return (): void => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [open, mounted, target, placement, step]);

  // Keyboard: Escape skips, Enter advances, Tab focus-traps inside the card.
  useEffect(() => {
    if (!open || !mounted) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
        return;
      }
      if (e.key === 'Enter') {
        // Don't hijack Enter inside an input — the host might have form
        // fields inside a custom card. We only own the default keypress
        // when the focused element is one of the card's own buttons.
        const active = (cardRef.current?.ownerDocument ?? document).activeElement;
        if (active instanceof HTMLButtonElement && cardRef.current?.contains(active)) {
          // Let the button's own click handler run.
          return;
        }
        if (cardRef.current?.contains(active)) {
          e.preventDefault();
          handleNext();
        }
        return;
      }
      if (e.key === 'Tab') {
        trapTabKey(e, cardRef.current);
      }
    };
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, mounted, handleSkip, handleNext]);

  // Auto-focus the Next button on open so "press Enter to continue" works.
  useEffect(() => {
    if (!open || !mounted) return;
    // Slight defer so the portal subtree is in the DOM.
    const t = setTimeout(() => {
      nextBtnRef.current?.focus();
    }, 0);
    return (): void => clearTimeout(t);
  }, [open, mounted, step]);

  if (!open || !mounted) return null;

  const viewport =
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1024, height: 768 };
  const rect = targetRect ?? centreOfViewportRect(viewport);

  // Highlight ring — uses the box-shadow cutout trick: a transparent
  // rectangle the size of the target with a huge spread shadow paints
  // the rest of the page translucent.
  const ringStyle: CSSProperties = {
    position: 'fixed',
    top: rect.top - RING_PADDING_PX,
    left: rect.left - RING_PADDING_PX,
    width: rect.width + RING_PADDING_PX * 2,
    height: rect.height + RING_PADDING_PX * 2,
    borderRadius: RING_RADIUS_PX,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'none',
    zIndex: 1000,
    transition: reducedMotion
      ? 'none'
      : 'top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease',
  };

  const cardStyle: CSSProperties = {
    position: 'fixed',
    top: cardPos.top,
    left: cardPos.left,
    width: CARD_WIDTH_PX,
    maxWidth: '100%',
    zIndex: 1001,
    opacity: 1,
    transition: reducedMotion ? 'none' : 'opacity 120ms ease, transform 120ms ease',
  };

  return createPortal(
    <>
      <span
        data-cir-component="TourStep"
        data-cir-part="tour-step-overlay"
        data-step={step}
        data-total={totalSteps}
        aria-hidden="true"
        style={ringStyle}
      />
      <div
        ref={cardRef}
        id={cardId}
        data-cir-component="TourStep"
        data-cir-part="tour-step-card"
        data-side={cardPos.side}
        data-step={step}
        data-total={totalSteps}
        data-elevation="popover"
        role="dialog"
        aria-label={ariaLabel ?? 'Tour step'}
        aria-modal="false"
        className={cn(
          'bg-white text-gray-900 rounded-lg ring-1 ring-gray-200 p-4 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700',
          elevationClass.popover,
          className,
        )}
        style={cardStyle}
      >
        <div
          data-cir-part="tour-step-title"
          style={{
            fontWeight: 600,
            fontSize: '14px',
            marginBottom: description ? '4px' : '12px',
          }}
        >
          {title}
        </div>
        {description !== undefined && description.length > 0 ? (
          <div
            data-cir-part="tour-step-description"
            style={{ fontSize: '13px', lineHeight: 1.5, marginBottom: '12px', opacity: 0.85 }}
          >
            {description}
          </div>
        ) : null}
        <div
          data-cir-part="tour-step-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <TourProgress current={step} total={totalSteps} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              data-cir-part="tour-step-skip"
              onClick={handleSkip}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Skip
            </button>
            {!isFirst ? (
              <button
                type="button"
                data-cir-part="tour-step-prev"
                onClick={handlePrev}
                className="text-xs text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Prev
              </button>
            ) : null}
            <button
              ref={nextBtnRef}
              type="button"
              data-cir-part={isLast ? 'tour-step-done' : 'tour-step-next'}
              onClick={handleNext}
              className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              style={{
                border: 'none',
                borderRadius: '6px',
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
TourStep.displayName = 'TourStep';

export function tourStepTextRender(props?: Partial<TourStepProps>): string {
  const p = props ?? {};
  const t = typeof p.title === 'string' ? p.title : '';
  const s = typeof p.step === 'number' ? p.step : 0;
  const total = typeof p.totalSteps === 'number' ? p.totalSteps : 0;
  const counter = total > 0 ? ` (${String(s)}/${String(total)})` : '';
  return t.length > 0 ? `[TourStep: ${t}${counter}]` : '[TourStep]';
}

export const TourStepBinding: ComponentBinding = {
  id: 'TourStep',
  factory: TourStep as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Contextual highlight ring + tooltip card around a target element, with ' +
      'Skip / Prev / Next controls and a `<TourProgress>` strip in the footer. ' +
      'Last-step Next labels itself "Done" and calls `onComplete`. Honours ' +
      'reduced-motion (snap into position). Keyboard: Escape skips, Enter ' +
      'advances, Tab focus-traps inside the card. Composition role: leaf.',
    allowed_props: {
      // `target` accepts string OR HTMLElement; the contract type tag is a
      // single string, so we use `'unknown'` to permit either shape.
      target: 'unknown',
      title: 'string',
      description: 'string',
      step: 'number',
      totalSteps: 'number',
      placement: 'string',
      open: 'boolean',
      ariaLabel: 'string',
      className: 'string',
    },
  },
};
