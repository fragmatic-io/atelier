// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Lightbox,
  LightboxBinding,
  lightboxTextRender,
  type LightboxItem,
} from '../src/components/Lightbox.js';

const ITEMS: readonly LightboxItem[] = Object.freeze([
  { src: '/a.jpg', alt: 'Alpha', caption: 'first' },
  { src: '/b.jpg', alt: 'Bravo' },
  { src: '/c.jpg', alt: 'Charlie', caption: 'last' },
]);

/**
 * Replace `window.matchMedia` so the runtime's `isReducedMotion()` flips.
 * happy-dom defaults to `matches: false` — we need both directions.
 */
function mockReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia;
  const mock = (q: string): MediaQueryList => {
    const stub = {
      matches: q.includes('prefers-reduced-motion') ? matches : false,
      media: q,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
    return stub as MediaQueryList;
  };
  window.matchMedia = mock;
  return (): void => {
    window.matchMedia = original;
  };
}

describe('Lightbox', () => {
  it('binding id matches', () => {
    expect(LightboxBinding.id).toBe('Lightbox');
  });

  it('does not render when open=false', () => {
    render(<Lightbox items={ITEMS} open={false} onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-component="Lightbox"]')).toBeNull();
  });

  it('does not render when items is empty', () => {
    render(<Lightbox items={[]} open onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-component="Lightbox"]')).toBeNull();
  });

  it('renders into a portal on document.body when open', () => {
    render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
    const overlay = document.querySelector('[data-cir-component="Lightbox"]');
    expect(overlay).not.toBeNull();
    // The portal must escape any stacking-context ancestor; the easiest
    // signal is that the overlay's parent is `document.body`.
    expect(overlay?.parentElement).toBe(document.body);
  });

  it('renders the dialog with proper ARIA', () => {
    render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
    const dialog = document.querySelector('[data-cir-part="lightbox-dialog"]');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Image viewer');
  });

  it('renders the active image, caption, and "N of M" index badge', () => {
    render(<Lightbox items={ITEMS} open initialIndex={0} onClose={() => undefined} />);
    const img = document.querySelector('[data-cir-part="lightbox-image"]') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/a.jpg');
    expect(img.getAttribute('alt')).toBe('Alpha');
    expect(document.querySelector('[data-cir-part="lightbox-caption"]')?.textContent).toBe('first');
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('1 of 3');
  });

  it('moves focus into the dialog on open', async () => {
    vi.useFakeTimers();
    render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
    // The focus is moved on the next macrotask via setTimeout(..., 0).
    await vi.runAllTimersAsync();
    const dialog = document.querySelector('[data-cir-part="lightbox-dialog"]');
    expect(document.activeElement).toBe(dialog);
    vi.useRealTimers();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Lightbox items={ITEMS} open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop overlay is clicked but NOT when the image is clicked', () => {
    const onClose = vi.fn();
    render(<Lightbox items={ITEMS} open onClose={onClose} />);
    const overlay = document.querySelector('[data-cir-component="Lightbox"]') as HTMLElement;
    // Clicking the image — does NOT close.
    fireEvent.click(document.querySelector('[data-cir-part="lightbox-image"]')!);
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the backdrop overlay (the overlay itself, not a child) — closes.
    fireEvent.click(overlay, { target: overlay });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<Lightbox items={ITEMS} open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('navigates with ArrowRight / ArrowLeft and clamps at the edges', () => {
    const onIndexChange = vi.fn();
    render(
      <Lightbox
        items={ITEMS}
        open
        initialIndex={0}
        onClose={() => undefined}
        onIndexChange={onIndexChange}
      />,
    );
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('1 of 3');
    // ArrowRight to 2 of 3.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('2 of 3');
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    // ArrowRight to 3 of 3.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('3 of 3');
    // ArrowRight at the end — clamps; no further change.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('3 of 3');
    // ArrowLeft back to 2 of 3.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('2 of 3');
  });

  it('Home jumps to first, End jumps to last', () => {
    render(<Lightbox items={ITEMS} open initialIndex={1} onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('2 of 3');
    fireEvent.keyDown(window, { key: 'End' });
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('3 of 3');
    fireEvent.keyDown(window, { key: 'Home' });
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('1 of 3');
  });

  it('clicking the image toggles 1× ↔ 2× zoom', () => {
    render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
    const overlay = document.querySelector('[data-cir-component="Lightbox"]') as HTMLElement;
    expect(overlay.getAttribute('data-cir-zoom')).toBe('1');
    fireEvent.click(document.querySelector('[data-cir-part="lightbox-image"]')!);
    expect(overlay.getAttribute('data-cir-zoom')).toBe('2');
    fireEvent.click(document.querySelector('[data-cir-part="lightbox-image"]')!);
    expect(overlay.getAttribute('data-cir-zoom')).toBe('1');
  });

  it('double-click on the image also toggles zoom', () => {
    render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
    const overlay = document.querySelector('[data-cir-component="Lightbox"]') as HTMLElement;
    expect(overlay.getAttribute('data-cir-zoom')).toBe('1');
    fireEvent.doubleClick(document.querySelector('[data-cir-part="lightbox-image"]')!);
    expect(overlay.getAttribute('data-cir-zoom')).toBe('2');
  });

  it('+/- keys zoom in/out when zoomable=true (default)', () => {
    render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
    const overlay = document.querySelector('[data-cir-component="Lightbox"]') as HTMLElement;
    fireEvent.keyDown(window, { key: '+' });
    expect(overlay.getAttribute('data-cir-zoom')).toBe('2');
    fireEvent.keyDown(window, { key: '-' });
    expect(overlay.getAttribute('data-cir-zoom')).toBe('1');
  });

  it('does NOT toggle zoom when zoomable=false', () => {
    render(<Lightbox items={ITEMS} open zoomable={false} onClose={() => undefined} />);
    const overlay = document.querySelector('[data-cir-component="Lightbox"]') as HTMLElement;
    fireEvent.click(document.querySelector('[data-cir-part="lightbox-image"]')!);
    expect(overlay.getAttribute('data-cir-zoom')).toBe('1');
    fireEvent.keyDown(window, { key: '+' });
    expect(overlay.getAttribute('data-cir-zoom')).toBe('1');
  });

  it('zoom resets when the active image changes', () => {
    render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
    const overlay = document.querySelector('[data-cir-component="Lightbox"]') as HTMLElement;
    fireEvent.click(document.querySelector('[data-cir-part="lightbox-image"]')!);
    expect(overlay.getAttribute('data-cir-zoom')).toBe('2');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(overlay.getAttribute('data-cir-zoom')).toBe('1');
  });

  it('renders thumbnails strip when items.length > 1 and clicks jump to that index', () => {
    render(<Lightbox items={ITEMS} open initialIndex={0} onClose={() => undefined} />);
    const thumbs = document.querySelectorAll('[data-cir-part="lightbox-thumbnail"]');
    expect(thumbs.length).toBe(3);
    expect(thumbs[0]?.getAttribute('data-active')).toBe('true');
    fireEvent.click(thumbs[2]!);
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('3 of 3');
    const after = document.querySelectorAll('[data-cir-part="lightbox-thumbnail"]');
    expect(after[2]?.getAttribute('data-active')).toBe('true');
    expect(after[0]?.getAttribute('data-active')).toBe('false');
  });

  it('hides thumbnails strip for a single item by default', () => {
    const single: LightboxItem[] = [{ src: '/only.jpg', alt: 'only' }];
    render(<Lightbox items={single} open onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-part="lightbox-thumbnails"]')).toBeNull();
  });

  it('explicit showThumbnails=false hides the strip even when items.length > 1', () => {
    render(<Lightbox items={ITEMS} open showThumbnails={false} onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-part="lightbox-thumbnails"]')).toBeNull();
  });

  it('prev/next nav buttons disable at the edges', () => {
    render(<Lightbox items={ITEMS} open initialIndex={0} onClose={() => undefined} />);
    const prev = document.querySelector('[data-cir-part="lightbox-prev"]');
    const next = document.querySelector('[data-cir-part="lightbox-next"]');
    expect(prev?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);
    fireEvent.keyDown(window, { key: 'End' });
    const next2 = document.querySelector('[data-cir-part="lightbox-next"]');
    expect(next2?.disabled).toBe(true);
  });

  it('honours initialIndex on each open', () => {
    const { rerender } = render(
      <Lightbox items={ITEMS} open={false} initialIndex={1} onClose={() => undefined} />,
    );
    rerender(<Lightbox items={ITEMS} open initialIndex={2} onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('3 of 3');
  });

  it('reduced-motion mode emits the data attribute and skips the transition style', () => {
    const restore = mockReducedMotion(true);
    try {
      render(<Lightbox items={ITEMS} open onClose={() => undefined} />);
      const overlay = document.querySelector('[data-cir-component="Lightbox"]');
      expect(overlay?.getAttribute('data-cir-reduced-motion')).toBe('true');
      const img = document.querySelector('[data-cir-part="lightbox-image"]') as HTMLImageElement;
      expect(img.style.transition).toBe('none');
    } finally {
      restore();
    }
  });

  it('text renderer summarises item count', () => {
    expect(lightboxTextRender({ items: ITEMS, open: true, onClose: () => undefined })).toBe(
      '[Lightbox: 3 images]',
    );
    expect(
      lightboxTextRender({
        items: [{ src: '/x.jpg' }],
        open: true,
        onClose: () => undefined,
      }),
    ).toBe('[Lightbox: 1 image]');
  });

  it('binding declares manifestContract', () => {
    expect(LightboxBinding.manifestContract).toBeDefined();
    expect(LightboxBinding.manifestContract?.allowed_props['items']).toBe('array');
    expect(LightboxBinding.manifestContract?.allowed_props['open']).toBe('boolean');
  });
});
