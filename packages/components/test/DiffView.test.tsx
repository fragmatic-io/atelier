// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import {
  DiffView,
  DiffViewBinding,
  diffViewTextRender,
  type DiffHunk,
  type LegacyDiffRow,
} from '../src/components/DiffView.js';
import { clearShikiCache } from '../src/code/shiki.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEGACY_HUNKS: readonly LegacyDiffRow[] = [
  { kind: 'context', line: 'unchanged', oldNumber: 1, newNumber: 1 },
  { kind: 'remove', line: 'old line', oldNumber: 2 },
  { kind: 'add', line: 'new line', newNumber: 2 },
  { kind: 'add', line: 'extra', newNumber: 3 },
];

/** A hunk modelled after a real-world unified-diff change. */
const HUNK: DiffHunk = {
  oldStart: 10,
  oldLines: 4,
  newStart: 10,
  newLines: 4,
  lines: [
    { kind: 'context', content: 'function foo() {', oldLineNumber: 10, newLineNumber: 10 },
    { kind: 'del', content: '  return 1;', oldLineNumber: 11 },
    { kind: 'add', content: '  return 2;', newLineNumber: 11 },
    { kind: 'context', content: '}', oldLineNumber: 12, newLineNumber: 12 },
  ],
};

const HUNK_WITH_HIDDEN: DiffHunk = {
  ...HUNK,
  contextHidden: 7,
};

// ---------------------------------------------------------------------------
// Shiki mock — same shape as code-shiki.test.tsx so we can drive the
// per-hunk highlight path without booting the real WASM grammar.
// ---------------------------------------------------------------------------

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
          // Emit one `<span class="line">` per source line, matching the
          // shape Shiki ≥ 1.x produces. Trailing `\n` separates lines.
          const inner = code
            .split('\n')
            .map(
              (l) =>
                `<span class="line"><span class="tok" data-mock-theme="${opts.theme}">${l}</span></span>\n`,
            )
            .join('');
          return `<pre><code>${inner}</code></pre>`;
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

// ---------------------------------------------------------------------------
// Back-compat (Wave 7 row-list shape)
// ---------------------------------------------------------------------------

describe('DiffView — legacy row-list back-compat', () => {
  it('renders one row per legacy hunk with data-diff', () => {
    const { container } = render(<DiffView hunks={LEGACY_HUNKS} />);
    const rows = container.querySelectorAll('[data-cir-part="diff-row"]');
    expect(rows.length).toBe(4);
    expect(rows[0]?.getAttribute('data-diff')).toBe('context');
    expect(rows[1]?.getAttribute('data-diff')).toBe('del');
    expect(rows[2]?.getAttribute('data-diff')).toBe('add');
  });

  it('prefixes add / del / context with +, -, space', () => {
    const { container } = render(<DiffView hunks={LEGACY_HUNKS} />);
    const markers = container.querySelectorAll('[data-cir-part="diff-marker"]');
    expect(markers[0]?.textContent).toBe(' ');
    expect(markers[1]?.textContent).toBe('-');
    expect(markers[2]?.textContent).toBe('+');
  });

  it('renders old / new line numbers when present', () => {
    const { container } = render(<DiffView hunks={LEGACY_HUNKS} />);
    const olds = container.querySelectorAll('[data-cir-part="diff-old-num"]');
    const news = container.querySelectorAll('[data-cir-part="diff-new-num"]');
    expect(olds[0]?.textContent).toBe('1');
    expect(olds[2]?.textContent).toBe('');
    expect(news[1]?.textContent).toBe('');
    expect(news[2]?.textContent).toBe('2');
  });

  it('renders the line content', () => {
    const { container } = render(<DiffView hunks={LEGACY_HUNKS} />);
    const lines = container.querySelectorAll('[data-cir-part="diff-line"]');
    expect(lines[0]?.textContent).toBe('unchanged');
    expect(lines[2]?.textContent).toBe('new line');
  });

  it('text-render reports +adds / -removes for legacy rows', () => {
    expect(diffViewTextRender({ hunks: LEGACY_HUNKS })).toBe('[DiffView: +2 -1]');
  });

  it('binding id matches', () => {
    expect(DiffViewBinding.id).toBe('DiffView');
  });

  it('legacy callers default to the `minimal` variant (no header)', () => {
    const { container } = render(<DiffView hunks={LEGACY_HUNKS} />);
    expect(
      container.querySelector('[data-cir-component="DiffView"]')?.getAttribute('data-variant'),
    ).toBe('minimal');
    expect(container.querySelector('[data-cir-part="diff-hunk-header"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cnt-2: new hunk shape — modes
// ---------------------------------------------------------------------------

describe('DiffView — Cnt-2 unified mode', () => {
  it('renders the @@ hunk header for each hunk', () => {
    const { container } = render(<DiffView hunks={[HUNK]} />);
    const header = container.querySelector('[data-cir-part="diff-hunk-header"]');
    expect(header?.textContent).toBe('@@ -10,4 +10,4 @@');
  });

  it('emits one diff-row per line with data-diff', () => {
    const { container } = render(<DiffView hunks={[HUNK]} />);
    const rows = container.querySelectorAll('[data-cir-part="diff-row"]');
    expect(rows.length).toBe(4);
    expect(rows[0]?.getAttribute('data-diff')).toBe('context');
    expect(rows[1]?.getAttribute('data-diff')).toBe('del');
    expect(rows[2]?.getAttribute('data-diff')).toBe('add');
    expect(rows[3]?.getAttribute('data-diff')).toBe('context');
  });

  it('defaults to the unified variant for new-shape hunks', () => {
    const { container } = render(<DiffView hunks={[HUNK]} />);
    expect(
      container.querySelector('[data-cir-component="DiffView"]')?.getAttribute('data-variant'),
    ).toBe('unified');
  });

  it('renders old-side line numbers for del rows and new-side for add rows', () => {
    const { container } = render(<DiffView hunks={[HUNK]} />);
    const olds = container.querySelectorAll('[data-cir-part="diff-old-num"]');
    const news = container.querySelectorAll('[data-cir-part="diff-new-num"]');
    // Row 1 = del, has old=11 only
    expect(olds[1]?.textContent).toBe('11');
    expect(news[1]?.textContent).toBe('');
    // Row 2 = add, has new=11 only
    expect(olds[2]?.textContent).toBe('');
    expect(news[2]?.textContent).toBe('11');
  });
});

describe('DiffView — Cnt-2 split mode', () => {
  it('renders side-by-side rows pairing del→add by index', () => {
    const { container } = render(<DiffView hunks={[HUNK]} variant="split" />);
    const rows = container.querySelectorAll('[data-cir-part="diff-split-row"]');
    // 2 context rows + 1 paired del/add row = 3 visual rows
    expect(rows.length).toBe(3);
  });

  it('routes deletions to the old side and additions to the new side', () => {
    const { container } = render(<DiffView hunks={[HUNK]} variant="split" />);
    // The paired row sits at index 1 (between two context rows).
    const paired = container.querySelectorAll('[data-cir-part="diff-split-row"]')[1];
    const cells = paired?.querySelectorAll('[data-cir-part="diff-row"]');
    expect(cells?.[0]?.getAttribute('data-side')).toBe('old');
    expect(cells?.[0]?.getAttribute('data-diff')).toBe('del');
    expect(cells?.[1]?.getAttribute('data-side')).toBe('new');
    expect(cells?.[1]?.getAttribute('data-diff')).toBe('add');
  });

  it('renders an empty placeholder cell when one side is missing', () => {
    const skewed: DiffHunk = {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 1,
      lines: [
        { kind: 'del', content: 'gone-1', oldLineNumber: 1 },
        { kind: 'del', content: 'gone-2', oldLineNumber: 2 },
        { kind: 'add', content: 'new', newLineNumber: 1 },
      ],
    };
    const { container } = render(<DiffView hunks={[skewed]} variant="split" />);
    const empties = container.querySelectorAll('[data-cir-part="diff-row"][data-kind="empty"]');
    // The second deletion has no add to pair with → 1 empty cell on the right.
    expect(empties.length).toBe(1);
  });
});

describe('DiffView — Cnt-2 minimal mode', () => {
  it('explicit `minimal` strips the @@ header for new-shape hunks', () => {
    const { container } = render(<DiffView hunks={[HUNK]} variant="minimal" />);
    expect(container.querySelector('[data-cir-part="diff-hunk-header"]')).toBeNull();
    // Rows still render.
    expect(container.querySelectorAll('[data-cir-part="diff-row"]').length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Cnt-2: per-hunk Shiki syntax highlighting
// ---------------------------------------------------------------------------

describe('DiffView — per-hunk Shiki highlight', () => {
  it('without `language`, no highlighted spans land', () => {
    const { container } = render(<DiffView hunks={[HUNK]} />);
    expect(container.querySelector('[data-cir-part="diff-line"][data-theme]')).toBeNull();
    expect(
      container
        .querySelector('[data-cir-component="DiffView"]')
        ?.getAttribute('data-highlight-state'),
    ).toBe('idle');
  });

  it('with `language="ts"`, swaps in dual-theme highlighted line spans', async () => {
    mockShiki();
    const { container } = render(<DiffView hunks={[HUNK]} language="ts" />);
    await waitFor(() => {
      expect(
        container
          .querySelector('[data-cir-component="DiffView"]')
          ?.getAttribute('data-highlight-state'),
      ).toBe('ready');
    });
    const lights = container.querySelectorAll('[data-cir-part="diff-line"][data-theme="light"]');
    expect(lights.length).toBe(4);
    // The mock embeds the theme id — verify it threaded through.
    expect(lights[0]?.innerHTML).toContain('data-mock-theme="github-light"');
  });
});

// ---------------------------------------------------------------------------
// Cnt-2: expand-context callback
// ---------------------------------------------------------------------------

describe('DiffView — expand-to-context', () => {
  it('renders an "Expand N lines" button when contextHidden + onExpandContext are set', () => {
    const onExpand = vi.fn();
    const { container } = render(
      <DiffView hunks={[HUNK_WITH_HIDDEN]} onExpandContext={onExpand} />,
    );
    const btn = container.querySelector('[data-cir-part="diff-expand-context"]');
    expect(btn?.textContent).toBe('Expand 7 lines');
  });

  it('invokes onExpandContext with the hunk index on click', () => {
    const onExpand = vi.fn();
    const { container } = render(
      <DiffView hunks={[HUNK, HUNK_WITH_HIDDEN]} onExpandContext={onExpand} />,
    );
    const btn = container.querySelector('[data-cir-part="diff-expand-context"]');
    if (btn !== null) fireEvent.click(btn);
    expect(onExpand).toHaveBeenCalledWith(1);
  });

  it('does not render the expand control without an onExpandContext callback', () => {
    const { container } = render(<DiffView hunks={[HUNK_WITH_HIDDEN]} />);
    expect(container.querySelector('[data-cir-part="diff-expand-context"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cnt-2: linkLines + highlightLines
// ---------------------------------------------------------------------------

describe('DiffView — linkLines + highlightLines', () => {
  it('linkLines stamps `id="L<n>"` on each row keyed off the new-side line', () => {
    const { container } = render(<DiffView hunks={[HUNK]} linkLines />);
    expect(container.querySelector('#L10')).toBeTruthy();
    expect(container.querySelector('#L11')).toBeTruthy();
    expect(container.querySelector('#L12')).toBeTruthy();
  });

  it('highlightLines flips data-highlight on matching new-side rows', () => {
    const { container } = render(<DiffView hunks={[HUNK]} highlightLines={[11]} />);
    const rows = container.querySelectorAll('[data-cir-part="diff-row"]');
    // The add row at new=11 is the one that should be highlighted.
    expect(rows[2]?.getAttribute('data-highlight')).toBe('true');
    expect(rows[0]?.getAttribute('data-highlight')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cnt-2: `code` prop fallback (back-compat escape hatch)
// ---------------------------------------------------------------------------

describe('DiffView — code prop fallback', () => {
  it('renders `code` as a single non-decorated block when no hunks are passed', () => {
    const { container } = render(<DiffView code={'a\nb\nc'} />);
    const block = container.querySelector('[data-cir-part="diff-code"]');
    expect(block?.textContent).toBe('a\nb\nc');
    expect(container.querySelector('[data-cir-part="diff-row"]')).toBeNull();
  });

  it('text-render reports zero adds / deletes when only `code` is set', () => {
    expect(diffViewTextRender({ code: 'foo\nbar' })).toBe('[DiffView: +0 -0]');
  });
});

// ---------------------------------------------------------------------------
// Cnt-2: text-render correctness for new shape
// ---------------------------------------------------------------------------

describe('DiffView — text-render', () => {
  it('counts add / del lines from new-shape hunks', () => {
    expect(diffViewTextRender({ hunks: [HUNK] })).toBe('[DiffView: +1 -1]');
  });
});
