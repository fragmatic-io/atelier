// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Aurora — Tailwind v4 configuration for the Atelier demo.
 *
 * Tailwind v4 is CSS-first; most theming happens via `@theme` blocks in
 * `app/globals.css`. We still ship this JS config so:
 *   1. The `dark:` variant resolves both for `class="dark"` and
 *      `[data-color-mode="dark"]` (the runtime mirrors
 *      `intent.global_preferences.color_mode` onto the latter — Wave 6 P-1).
 *   2. Tailwind's theme extensions surface the Aurora tokens as utilities
 *      (`bg-bg`, `text-fg`, `border-border`, `rounded-md`, `shadow-popover`,
 *      …). The values mirror `apps/demo/lib/brand-kit.ts` — that module is
 *      the declarative source of truth; this file is the build-time
 *      projection. The two are pinned together by
 *      `apps/demo/test/brand-kit.test.ts`.
 *
 * Tailwind picks this file up via the `@config '../tailwind.config.mjs'`
 * directive in `app/globals.css`.
 */

/** @type {import('tailwindcss').Config} */
const config = {
  // Tailwind v4 still respects the JS `darkMode` field. We accept BOTH the
  // class strategy (`html.dark`) and the data-attr selector — `<Chrome>`
  // sets both today, but downstream hosts may set just one.
  darkMode: ['class', '[data-color-mode="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Variable-driven tokens — these track `data-color-mode`.
        bg: 'var(--cir-color-bg)',
        surface: 'var(--cir-color-surface)',
        muted: 'var(--cir-color-muted)',
        border: 'var(--cir-color-border)',
        fg: {
          DEFAULT: 'var(--cir-color-fg)',
          muted: 'var(--cir-color-fg-muted)',
          subtle: 'var(--cir-color-fg-subtle)',
        },
        primary: {
          DEFAULT: 'var(--cir-color-primary)',
          fg: 'var(--cir-color-primary-fg)',
        },
        accent: 'var(--cir-color-accent)',
        danger: 'var(--cir-color-danger)',
        success: 'var(--cir-color-success)',
        warning: 'var(--cir-color-warning)',

        // Raw aurora tokens — keep callers wired to the kit's named scale
        // when they need a stable colour regardless of mode.
        aurora: {
          primary: '#6e56cf',
          accent: '#67e8f9',
          'surface-light': '#fafafb',
          'surface-dark': '#0a0a0c',
          'fg-light': '#1c1c20',
          'fg-dark': '#f5f5f7',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Inter Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'JetBrains Mono Variable',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // Aurora dense scale.
        xs: '11px',
        sm: '12px',
        md: '14px',
        base: '14px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        // Vis-7 — five-step elevation scale, paired light/dark via CSS
        // variables in globals.css. Components consume these via the
        // `elevationClass` table (`shadow-sm` / `shadow-md` / `shadow-lg`
        // / `shadow-xl`); we also keep the level-named aliases for hosts
        // that want to read them directly.
        sm: 'var(--cir-shadow-hover)',
        md: 'var(--cir-shadow-popover)',
        lg: 'var(--cir-shadow-modal)',
        xl: 'var(--cir-shadow-commandbar)',
        resting: 'var(--cir-shadow-resting)',
        hover: 'var(--cir-shadow-hover)',
        popover: 'var(--cir-shadow-popover)',
        modal: 'var(--cir-shadow-modal)',
        commandbar: 'var(--cir-shadow-commandbar)',
      },
      transitionDuration: {
        fast: '100ms',
        normal: '160ms',
        slow: '240ms',
      },
      transitionTimingFunction: {
        'aurora-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'aurora-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'aurora-in': 'cubic-bezier(0.4, 0, 1, 1)',
        'aurora-spring': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
};

export default config;
