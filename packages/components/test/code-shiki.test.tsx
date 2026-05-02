// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { CodeView } from '../src/components/CodeView.js';
import { clearShikiCache } from '../src/code/shiki.js';

/**
 * Minimal Shiki stub — installed via `vi.mock('shiki', …)`. The real Shiki
 * boots WASM oniguruma which is unsuitable for happy-dom; we just want to
 * verify the lazy-import → loadLanguage → codeToHtml path the component
 * walks, and that the dual-theme HTML lands in the DOM.
 */
function mockShiki(): void {
  vi.doMock('shiki', () => ({
    createHighlighter: vi.fn(({ themes }: { themes: readonly string[] }) => {
      const loaded = new Set<string>();
      const themesLoaded = new Set<string>(themes);
      return Promise.resolve({
        loadLanguage: vi.fn((lang: string) => {
          loaded.add(lang);
          return Promise.resolve();
        }),
        loadTheme: vi.fn((theme: string) => {
          themesLoaded.add(theme);
          return Promise.resolve();
        }),
        codeToHtml: vi.fn((code: string, opts: { lang: string; theme: string }) => {
          if (!loaded.has(opts.lang)) throw new Error(`grammar ${opts.lang} not loaded`);
          if (!themesLoaded.has(opts.theme)) throw new Error(`theme ${opts.theme} not loaded`);
          return `<pre data-mock-theme="${opts.theme}" data-mock-lang="${opts.lang}"><code>${code}</code></pre>`;
        }),
      });
    }),
  }));
}

/** Force the import to reject — simulates "shiki not installed". */
function mockShikiUnavailable(): void {
  vi.doMock('shiki', () => {
    throw new Error('Cannot find module shiki');
  });
}

beforeEach(() => {
  clearShikiCache();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('shiki');
});

describe('CodeView — Shiki integration (Wave 11 / Cnt-1)', () => {
  it('back-compat: without `language`, renders the same plain <pre><code>', () => {
    const { container } = render(<CodeView code="const x = 1;" />);
    const code = container.querySelector('code[data-cir-part="codeview-code"]');
    expect(code?.textContent).toBe('const x = 1;');
    // No highlighted div lands when language is unset.
    expect(container.querySelector('[data-cir-part="codeview-highlighted"]')).toBeNull();
    expect(
      container.querySelector('[data-cir-component="CodeView"]')?.getAttribute('data-language'),
    ).toBe('plain');
  });

  it('with `language="ts"`, mounts in pending then swaps in highlighted dual-theme HTML', async () => {
    mockShiki();
    const { container } = render(<CodeView code="const x = 1;" language="ts" />);

    // Initial render is pending: plain <pre> with raw code.
    expect(
      container
        .querySelector('[data-cir-component="CodeView"]')
        ?.getAttribute('data-highlight-state'),
    ).toBe('pending');

    // Wait for the async highlight to land.
    await waitFor(() => {
      expect(
        container
          .querySelector('[data-cir-component="CodeView"]')
          ?.getAttribute('data-highlight-state'),
      ).toBe('ready');
    });

    const lightPane = container.querySelector(
      '[data-cir-part="codeview-highlighted"][data-theme="light"]',
    );
    const darkPane = container.querySelector(
      '[data-cir-part="codeview-highlighted"][data-theme="dark"]',
    );
    expect(lightPane).toBeTruthy();
    expect(darkPane).toBeTruthy();
    expect(lightPane?.innerHTML).toContain('data-mock-lang="ts"');
    expect(lightPane?.innerHTML).toContain('data-mock-theme="github-light"');
    expect(darkPane?.innerHTML).toContain('data-mock-theme="github-dark"');
  });

  it('falls back to plain <pre> when Shiki is unavailable', async () => {
    mockShikiUnavailable();
    const { container } = render(<CodeView code="const x = 1;" language="ts" />);

    // The hook should flip to 'error' once the dynamic import rejects.
    await waitFor(() => {
      expect(
        container
          .querySelector('[data-cir-component="CodeView"]')
          ?.getAttribute('data-highlight-state'),
      ).toBe('error');
    });

    // No highlighted divs in the tree — only the plain code stays visible.
    expect(container.querySelector('[data-cir-part="codeview-highlighted"]')).toBeNull();
    expect(container.querySelector('code[data-cir-part="codeview-code"]')?.textContent).toBe(
      'const x = 1;',
    );
  });

  it('renders a custom theme pair when `theme` prop overrides the default', async () => {
    mockShiki();
    const { container } = render(
      <CodeView code="x" language="ts" theme={{ light: 'min-light', dark: 'min-dark' }} />,
    );
    await waitFor(() => {
      const light = container.querySelector(
        '[data-cir-part="codeview-highlighted"][data-theme="light"]',
      );
      expect(light?.innerHTML).toContain('data-mock-theme="min-light"');
    });
    const dark = container.querySelector(
      '[data-cir-part="codeview-highlighted"][data-theme="dark"]',
    );
    expect(dark?.innerHTML).toContain('data-mock-theme="min-dark"');
  });
});

describe('CodeView — folding + line refs (Wave 11 / Cnt-1)', () => {
  it('linkLines: gives every line `id="L<n>"` for #L42 anchor scrolling', () => {
    const code = 'a\nb\nc';
    const { container } = render(<CodeView code={code} linkLines />);
    const l1 = container.querySelector('#L1');
    const l2 = container.querySelector('#L2');
    const l3 = container.querySelector('#L3');
    expect(l1).toBeTruthy();
    expect(l2).toBeTruthy();
    expect(l3).toBeTruthy();
    expect(l1?.getAttribute('data-line')).toBe('1');
  });

  it('highlightLines: emits `data-highlight="true"` only on matching lines', () => {
    const code = 'a\nb\nc\nd';
    const { container } = render(<CodeView code={code} highlightLines={[2, 4]} />);
    const lines = container.querySelectorAll('[data-cir-part="codeview-line"]');
    expect(lines).toHaveLength(4);
    expect(lines[0]?.getAttribute('data-highlight')).toBeNull();
    expect(lines[1]?.getAttribute('data-highlight')).toBe('true');
    expect(lines[2]?.getAttribute('data-highlight')).toBeNull();
    expect(lines[3]?.getAttribute('data-highlight')).toBe('true');
  });

  it('foldable: shows collapse control when lines > 20, hides extra lines', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line ${String(i + 1)}`).join('\n');
    const { container } = render(<CodeView code={lines} foldable />);
    const toggle = container.querySelector('[data-cir-part="codeview-fold-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('data-collapsed')).toBe('true');
    // Default collapsed view shows FOLD_COLLAPSED_LINES (10).
    const visible = container.querySelectorAll('[data-cir-part="codeview-line"]');
    expect(visible).toHaveLength(10);
    expect(toggle?.textContent).toContain('15 more lines');
  });

  it('foldable: clicking the toggle expands and re-collapses', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line ${String(i + 1)}`).join('\n');
    const { container } = render(<CodeView code={lines} foldable />);
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-cir-part="codeview-fold-toggle"]',
    );
    expect(toggle).toBeTruthy();
    act(() => {
      toggle?.click();
    });
    expect(toggle?.getAttribute('data-collapsed')).toBe('false');
    expect(container.querySelectorAll('[data-cir-part="codeview-line"]')).toHaveLength(25);
    act(() => {
      toggle?.click();
    });
    expect(toggle?.getAttribute('data-collapsed')).toBe('true');
    expect(container.querySelectorAll('[data-cir-part="codeview-line"]')).toHaveLength(10);
  });

  it('foldable: no toggle when lines <= 20', () => {
    const code = Array.from({ length: 5 }, (_, i) => `line ${String(i + 1)}`).join('\n');
    const { container } = render(<CodeView code={code} foldable />);
    expect(container.querySelector('[data-cir-part="codeview-fold-toggle"]')).toBeNull();
  });
});
