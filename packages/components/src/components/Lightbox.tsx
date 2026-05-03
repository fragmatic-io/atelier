// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Lightbox — fullscreen image viewer rendered into a portal.
 *
 * Wave 11 / Int-14. The "click any image to zoom" reflex without
 * boilerplate: every `<Image>` and `<Gallery>` item can opt into
 * `<Lightbox>` simply by setting the per-component `lightbox` prop, and
 * hosts that need richer multi-image flows (a product gallery, a doc
 * attachment list, a chat-message photo carousel) build directly on top
 * of `<Lightbox>` with their own `items[]` array.
 *
 * Behaviour:
 *  - Renders into `document.body` via `createPortal`. Background is a
 *    full-viewport overlay (`position: fixed; inset: 0`); clicking the
 *    backdrop (anywhere outside the image / chrome) closes.
 *  - Keyboard: Escape closes; ←/→ navigate (no looping — clamps at
 *    `[0, items.length-1]`); Home/End jump to the first / last item;
 *    +/- zoom in / out (only when `zoomable`).
 *  - Pointer: clicking the image toggles 1× ↔ 2× zoom; double-click does
 *    the same (so quick-double on a touchpad always lands).
 *  - Caption: rendered below the image when present.
 *  - Index: "N of M" badge top-right.
 *  - Close button (×) top-right, separate from the index badge.
 *  - Prev/next chevrons overlay the left / right edges. Disabled when
 *    `index === 0` / `index === items.length - 1`.
 *  - Optional thumbnails strip at the bottom — visible by default when
 *    `items.length > 1`; clicking a thumbnail jumps to that index, the
 *    active thumbnail carries `data-active="true"` so the host stylesheet
 *    can outline it.
 *  - Reduced motion: skip transition between images, snap.
 *  - Focus management: focus trap inside the lightbox; restore focus on
 *    close.
 *  - ARIA: `role="dialog"` + `aria-modal="true"` + `aria-label="Image viewer"`.
 *
 * Composition rule: `'leaf'` — items are content-driven via the `items`
 * prop, never via children.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ComponentBinding } from '@atelier/runtime';
import { isReducedMotion } from '@atelier/runtime';

export interface LightboxItem {
  src: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface LightboxProps {
  items: readonly LightboxItem[];
  open: boolean;
  /** Index to render first when `open` flips to true. Default 0. */
  initialIndex?: number;
  onClose: () => void;
  onIndexChange?: (i: number) => void;
  /**
   * Show the prev/next thumbnails strip at the bottom. Default `true`
   * when `items.length > 1`, otherwise `false`. Pass an explicit boolean
   * to override either way.
   */
  showThumbnails?: boolean;
  /** Allow zoom via click / keyboard. Default `true`. */
  zoomable?: boolean;
  className?: string;
}

/** Clamp a numeric index into `[0, length - 1]`. Empty `items` returns 0. */
function clampIndex(i: number, length: number): number {
  if (length <= 0) return 0;
  if (i < 0) return 0;
  if (i > length - 1) return length - 1;
  return i;
}

const ZOOM_LEVELS: readonly number[] = Object.freeze([1, 2]);

export function Lightbox({
  items,
  open,
  initialIndex = 0,
  onClose,
  onIndexChange,
  showThumbnails,
  zoomable = true,
  className,
}: LightboxProps): ReactNode {
  const length = items.length;
  // SSR-safe portal: only mount when the document is available.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Internal cursor — kept clamped against `items.length` so a parent
  // re-render that shrinks the array can never leave a stale index.
  const [index, setIndex] = useState<number>(() => clampIndex(initialIndex, length));
  // Re-seed when the lightbox transitions closed → open so a host that
  // updates `initialIndex` between opens sees the new value land.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setIndex(clampIndex(initialIndex, length));
    }
    wasOpen.current = open;
  }, [open, initialIndex, length]);

  // Re-clamp when the items array shrinks while open.
  useEffect(() => {
    setIndex((prev) => clampIndex(prev, length));
  }, [length]);

  // Zoom level. Reset when the active item or the open state changes.
  const [zoom, setZoom] = useState<number>(1);
  useEffect(() => {
    setZoom(1);
  }, [index, open]);

  const reducedMotion = isReducedMotion();

  // Refs for focus management.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const goTo = useCallback(
    (next: number): void => {
      const clamped = clampIndex(next, length);
      setIndex(clamped);
      onIndexChange?.(clamped);
    },
    [length, onIndexChange],
  );

  const goPrev = useCallback((): void => {
    setIndex((prev) => {
      const next = clampIndex(prev - 1, length);
      if (next !== prev) onIndexChange?.(next);
      return next;
    });
  }, [length, onIndexChange]);

  const goNext = useCallback((): void => {
    setIndex((prev) => {
      const next = clampIndex(prev + 1, length);
      if (next !== prev) onIndexChange?.(next);
      return next;
    });
  }, [length, onIndexChange]);

  const cycleZoom = useCallback(
    (direction: 1 | -1 | 'toggle'): void => {
      if (!zoomable) return;
      setZoom((current) => {
        const idx = ZOOM_LEVELS.indexOf(current);
        if (direction === 'toggle') {
          // 1× ↔ 2× toggle (top of the ramp wraps back to 1×).
          const next = idx === ZOOM_LEVELS.length - 1 ? 0 : idx + 1;
          return ZOOM_LEVELS[next] ?? 1;
        }
        const target = idx + direction;
        if (target < 0) return ZOOM_LEVELS[0] ?? 1;
        if (target >= ZOOM_LEVELS.length) return ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ?? 1;
        return ZOOM_LEVELS[target] ?? 1;
      });
    },
    [zoomable],
  );

  // Focus management: snapshot the currently-focused element on open,
  // move focus into the dialog, restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    // Defer to the next macrotask so the portal node is mounted.
    const id = window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
    return (): void => {
      window.clearTimeout(id);
      const restore = previouslyFocused.current;
      if (restore instanceof HTMLElement) {
        try {
          restore.focus();
        } catch {
          // Ignored — element may have unmounted while the lightbox was open.
        }
      }
    };
  }, [open]);

  // Global key handling: Escape, arrows, Home/End, +/- zoom. Bound at
  // window scope so the handler fires regardless of where the dialog's
  // focus currently lives (focus trap below covers Tab specifically).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        goTo(length - 1);
        return;
      }
      if (zoomable && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        cycleZoom(1);
        return;
      }
      if (zoomable && e.key === '-') {
        e.preventDefault();
        cycleZoom(-1);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, goPrev, goNext, goTo, length, zoomable, cycleZoom]);

  const onBackdropClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      // Only close when the user clicks the backdrop itself, not a child
      // (image / button / chrome). This is the canonical "click outside
      // the chrome to dismiss" behaviour shipped by every lightbox.
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // Focus trap — keep Tab inside the lightbox. We use a tiny custom trap
  // (not the dialog element) because the lightbox is a `<div>` portal.
  const onDialogKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }, []);

  const showThumbs = useMemo(() => {
    if (showThumbnails !== undefined) return showThumbnails;
    return length > 1;
  }, [showThumbnails, length]);

  if (!open || !mounted || length === 0) return null;

  const active = items[index];
  if (!active) return null;

  // --- styles ---------------------------------------------------------------
  // The inline styles below keep the component functional with zero CSS
  // shipped — host stylesheets can paint over via `data-cir-component`
  // and `data-cir-part` selectors.
  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
  };

  const stageStyle: CSSProperties = {
    position: 'relative',
    flex: 1,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  };

  const imageWrapperStyle: CSSProperties = {
    maxWidth: '100%',
    maxHeight: '100%',
    cursor: zoomable ? (zoom === 1 ? 'zoom-in' : 'zoom-out') : 'default',
    userSelect: 'none',
  };

  const imageStyle: CSSProperties = {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '100%',
    transform: `scale(${String(zoom)})`,
    transition: reducedMotion ? 'none' : 'transform 160ms cubic-bezier(0.2, 0, 0, 1)',
    transformOrigin: 'center center',
  };

  const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '36px',
    height: '36px',
    borderRadius: '999px',
    border: 'none',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: '20px',
    cursor: 'pointer',
  };

  const indexBadgeStyle: CSSProperties = {
    position: 'absolute',
    top: '18px',
    right: '60px',
    color: '#fff',
    fontSize: '14px',
    background: 'rgba(0,0,0,0.4)',
    padding: '4px 10px',
    borderRadius: '999px',
  };

  const navButtonBase: CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '44px',
    height: '44px',
    borderRadius: '999px',
    border: 'none',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: '20px',
    cursor: 'pointer',
  };

  const prevAtStart = index === 0;
  const nextAtEnd = index === length - 1;

  const overlay = (
    <div
      data-cir-component="Lightbox"
      data-cir-open="true"
      data-cir-index={String(index)}
      data-cir-zoom={String(zoom)}
      data-cir-reduced-motion={reducedMotion ? 'true' : 'false'}
      role="presentation"
      style={overlayStyle}
      className={className}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
        data-cir-part="lightbox-dialog"
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
        }}
        onClick={(e) => {
          // Stop propagation so a click anywhere inside the dialog does
          // NOT bubble to the backdrop's close handler.
          e.stopPropagation();
        }}
      >
        <div data-cir-part="lightbox-chrome" style={{ position: 'relative', height: 0 }}>
          <span
            data-cir-part="lightbox-index"
            aria-live="polite"
            style={indexBadgeStyle}
          >{`${String(index + 1)} of ${String(length)}`}</span>
          <button
            type="button"
            data-cir-part="lightbox-close"
            aria-label="Close"
            style={closeButtonStyle}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div data-cir-part="lightbox-stage" style={stageStyle}>
          {length > 1 ? (
            <button
              type="button"
              data-cir-part="lightbox-prev"
              aria-label="Previous image"
              disabled={prevAtStart}
              style={{ ...navButtonBase, left: '12px', opacity: prevAtStart ? 0.4 : 1 }}
              onClick={goPrev}
            >
              ‹
            </button>
          ) : null}

          <div data-cir-part="lightbox-image-wrapper" style={imageWrapperStyle}>
            <img
              data-cir-part="lightbox-image"
              src={active.src}
              alt={active.alt ?? ''}
              {...(active.width !== undefined ? { width: active.width } : {})}
              {...(active.height !== undefined ? { height: active.height } : {})}
              draggable={false}
              style={imageStyle}
              onClick={(e) => {
                // Click toggles zoom — KEY behaviour. Stop propagation so
                // the outer click handler doesn't double-fire.
                e.stopPropagation();
                if (zoomable) cycleZoom('toggle');
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (zoomable) cycleZoom('toggle');
              }}
            />
          </div>

          {length > 1 ? (
            <button
              type="button"
              data-cir-part="lightbox-next"
              aria-label="Next image"
              disabled={nextAtEnd}
              style={{ ...navButtonBase, right: '12px', opacity: nextAtEnd ? 0.4 : 1 }}
              onClick={goNext}
            >
              ›
            </button>
          ) : null}
        </div>

        {active.caption !== undefined ? (
          <figcaption
            data-cir-part="lightbox-caption"
            style={{
              color: '#fff',
              textAlign: 'center',
              padding: '12px 16px',
              fontSize: '14px',
            }}
          >
            {active.caption}
          </figcaption>
        ) : null}

        {showThumbs ? (
          <ul
            data-cir-part="lightbox-thumbnails"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '12px 0 0',
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              overflowX: 'auto',
              maxWidth: '100%',
            }}
          >
            {items.map((item, i) => (
              <li key={`${item.src}-${String(i)}`} data-cir-part="lightbox-thumbnail-item">
                <button
                  type="button"
                  data-cir-part="lightbox-thumbnail"
                  data-active={i === index ? 'true' : 'false'}
                  aria-label={`View image ${String(i + 1)}`}
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => goTo(i)}
                  style={{
                    padding: 0,
                    border: i === index ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                    borderRadius: '4px',
                    background: 'transparent',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    width: '60px',
                    height: '60px',
                  }}
                >
                  <img
                    src={item.src}
                    alt={item.alt ?? ''}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

Lightbox.displayName = 'Lightbox';

export function lightboxTextRender(props: LightboxProps): string {
  const len = props.items.length;
  return `[Lightbox: ${String(len)} ${len === 1 ? 'image' : 'images'}]`;
}

export const LightboxBinding: ComponentBinding = {
  id: 'Lightbox',
  factory: Lightbox,
  manifestContract: {
    description:
      'Fullscreen image viewer rendered into a portal. Renders one of `items[]` at a time with prev/next navigation, ' +
      'zoom toggle (1× ↔ 2×), keyboard control (←/→ navigate, Home/End jump, +/- zoom, Esc close), focus trap, and ' +
      'an optional thumbnails strip. Pair with `<Image lightbox>` for the "click any image to zoom" reflex.',
    allowed_props: {
      items: 'array',
      open: 'boolean',
      initialIndex: 'number',
      showThumbnails: 'boolean',
      zoomable: 'boolean',
      className: 'string',
    },
  },
};
