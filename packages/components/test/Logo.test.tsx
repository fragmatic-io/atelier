// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Logo, LogoBinding, logoTextRender } from '../src/components/Logo.js';

describe('Logo', () => {
  it('binding id matches', () => {
    expect(LogoBinding.id).toBe('Logo');
  });

  it('renders an <img> when src is provided', () => {
    const { container } = render(<Logo src="/aurora.svg" alt="Aurora" />);
    const img = container.querySelector('img[data-cir-part="logo-mark"]');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/aurora.svg');
  });

  it('renders a wordmark span when only wordmark is supplied', () => {
    const { container } = render(<Logo wordmark="Aurora" />);
    expect(container.querySelector('img')).toBeNull();
    const wm = container.querySelector('[data-cir-part="logo-wordmark"]');
    expect(wm?.textContent).toBe('Aurora');
  });

  it('renders glyph when only glyph is supplied (no src)', () => {
    const { container } = render(<Logo glyph="🌅" wordmark="Aurora" />);
    const g = container.querySelector('[data-cir-part="logo-glyph"]');
    expect(g?.textContent).toBe('🌅');
  });

  it('renders mark + wordmark lockup when both src and wordmark are supplied', () => {
    const { container } = render(<Logo src="/octant.svg" alt="Octant" wordmark="Octant" />);
    expect(container.querySelector('img[data-cir-part="logo-mark"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-part="logo-wordmark"]')?.textContent).toBe('Octant');
  });

  it('returns null when no src/glyph/wordmark provided', () => {
    const { container } = render(<Logo alt="empty" />);
    expect(container.querySelector('[data-cir-component="Logo"]')).toBeNull();
  });

  it('reflects size on data-size', () => {
    for (const size of ['sm', 'md', 'lg', 'xl'] as const) {
      const { container, unmount } = render(<Logo wordmark="X" size={size} />);
      expect(
        container.querySelector('[data-cir-component="Logo"]')?.getAttribute('data-size'),
      ).toBe(size);
      unmount();
    }
  });

  it('wraps in an <a> when href is provided', () => {
    const { container } = render(<Logo wordmark="Octant" href="/" />);
    const anchor = container.querySelector('a[data-cir-component="Logo"]');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('/');
  });

  it('uses wordmark as the accessible name (via aria-label / role=img)', () => {
    const { container } = render(<Logo wordmark="Aurora" />);
    const root = container.querySelector('[data-cir-component="Logo"]');
    expect(root?.getAttribute('role')).toBe('img');
    expect(root?.getAttribute('aria-label')).toBe('Aurora');
  });

  it('falls back to alt as accessible name when wordmark is absent', () => {
    const { container } = render(<Logo src="/o.svg" alt="Octant" />);
    const root = container.querySelector('[data-cir-component="Logo"]');
    expect(root?.getAttribute('aria-label')).toBe('Octant');
  });

  it('aria-hidden when only glyph and no name', () => {
    const { container } = render(<Logo glyph="🌅" />);
    const inner = container.querySelector('[aria-hidden="true"]');
    expect(inner).toBeTruthy();
  });

  it('text-render returns brand name', () => {
    expect(logoTextRender({ wordmark: 'Aurora' })).toBe('[Logo: Aurora]');
    expect(logoTextRender({ src: '/o.svg', alt: 'Octant' })).toBe('[Logo: Octant]');
    expect(logoTextRender({})).toBe('[Logo]');
  });

  it('mark height scales with size token', () => {
    const { container, rerender } = render(<Logo src="/x.svg" alt="x" size="sm" />);
    const sm = container.querySelector('img');
    expect(sm?.style.height).toBe('14px');
    rerender(<Logo src="/x.svg" alt="x" size="xl" />);
    const xl = container.querySelector('img');
    expect(xl?.style.height).toBe('40px');
  });
});
