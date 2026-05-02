// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { CodeBlock } from '../src/components/CodeBlock.js';
import { clearShikiCache } from '../src/code/shiki.js';

/**
 * Wave 11 / Cnt-1 integration: verify `<CodeBlock>` threads `language` /
 * `theme` / `foldable` / `highlightLines` / `linkLines` down to the inner
 * `<CodeView>`. Complements the unit tests in `code-shiki.test.tsx`.
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
          return `<pre data-mock-theme="${opts.theme}" data-mock-lang="${opts.lang}"><code>${code}</code></pre>`;
        }),
      });
    }),
  }));
}

beforeEach(() => {
  clearShikiCache();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('shiki');
});

describe('CodeBlock — Cnt-1 prop forwarding', () => {
  it('threads `language` (json) through to the inner CodeView and triggers highlight', async () => {
    mockShiki();
    const { container } = render(<CodeBlock code='{"x": 1}' language="json" />);
    await waitFor(() => {
      expect(
        container
          .querySelector('[data-cir-component="CodeView"]')
          ?.getAttribute('data-highlight-state'),
      ).toBe('ready');
    });
    const light = container.querySelector(
      '[data-cir-part="codeview-highlighted"][data-theme="light"]',
    );
    expect(light?.innerHTML).toContain('data-mock-lang="json"');
  });

  it('passes `linkLines` through — line ids land on the rendered output', () => {
    const { container } = render(<CodeBlock code={'a\nb'} language="plaintext" linkLines />);
    expect(container.querySelector('#L1')).toBeTruthy();
    expect(container.querySelector('#L2')).toBeTruthy();
  });

  it('passes `highlightLines` through — `data-highlight` lands on the matching line', () => {
    const { container } = render(
      <CodeBlock code={'a\nb\nc'} language="plaintext" highlightLines={[2]} />,
    );
    const lines = container.querySelectorAll('[data-cir-part="codeview-line"]');
    expect(lines[1]?.getAttribute('data-highlight')).toBe('true');
  });

  it('passes `foldable` through — toggle renders when lines > 20', () => {
    const code = Array.from({ length: 25 }, (_, i) => `line ${String(i + 1)}`).join('\n');
    const { container } = render(<CodeBlock code={code} language="plaintext" foldable />);
    expect(container.querySelector('[data-cir-part="codeview-fold-toggle"]')).toBeTruthy();
  });

  it('passes a custom `theme` pair through to the CodeView highlight call', async () => {
    mockShiki();
    const { container } = render(
      <CodeBlock code="x" language="typescript" theme={{ light: 'min-light', dark: 'min-dark' }} />,
    );
    await waitFor(() => {
      const light = container.querySelector(
        '[data-cir-part="codeview-highlighted"][data-theme="light"]',
      );
      expect(light?.innerHTML).toContain('data-mock-theme="min-light"');
    });
  });

  it('language="plaintext" maps to no-highlight (back-compat: same as today)', () => {
    const { container } = render(<CodeBlock code="some text" language="plaintext" />);
    // Plaintext drops the language pill AND skips highlighting.
    expect(container.querySelector('[data-cir-part="codeblock-language"]')).toBeNull();
    expect(
      container.querySelector('[data-cir-component="CodeView"]')?.getAttribute('data-language'),
    ).toBe('plain');
  });
});
