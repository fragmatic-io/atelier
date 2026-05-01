// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
// @vitest-environment happy-dom
/**
 * Wordmark contract tests. The wordmark renders an octagon SVG mark plus
 * the lowercase "octant" wordmark. Both fills resolve to `currentColor`
 * so the chrome can recolour the lockup just by setting `color`.
 *
 * We render via `react-dom/server` to avoid the client renderer's
 * happy-dom act() warnings — the wordmark is a pure stateless SVG so
 * the static markup tells us everything we need.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Wordmark } from '../components/Wordmark';

describe('Wordmark', () => {
  it('renders an SVG with the octant title and currentColor fills', () => {
    const html = renderToStaticMarkup(createElement(Wordmark, { height: 24 }));
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Octant"');
    expect(html).toContain('<title>Octant</title>');
    // Outer + inner octagons both keyed off currentColor — the chrome
    // re-colours the lockup by setting `color` on the wrapper.
    expect(html).toContain('fill="currentColor"');
    // Wordmark text uses the IBM Plex Mono stack so the lockup matches
    // the body's mono font. React's static renderer encodes `'` as `&#x27;`,
    // so we look for the encoded form.
    expect(html).toContain('IBM Plex Mono');
    expect(html).toContain('octant');
  });

  it('honours markOnly to hide the wordmark text', () => {
    const html = renderToStaticMarkup(createElement(Wordmark, { markOnly: true }));
    expect(html).toContain('<svg');
    // The `<text>` element is omitted in mark-only mode.
    expect(html).not.toContain('<text');
    // ViewBox shrinks to a 24-square when wordmark is hidden.
    expect(html).toContain('viewBox="0 0 24 24"');
  });

  it('scales width proportionally with height for the full lockup', () => {
    const small = renderToStaticMarkup(createElement(Wordmark, { height: 16 }));
    const large = renderToStaticMarkup(createElement(Wordmark, { height: 32 }));
    // height 16 -> width 70.4; height 32 -> width 140.8.
    expect(small).toContain('width="70.4"');
    expect(large).toContain('width="140.8"');
  });
});
