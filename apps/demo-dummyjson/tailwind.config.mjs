// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tailwind config — Marigold theme, dummyjson catalog demo.
 *
 * The runtime CSS in `app/globals.css` is the source of truth (CSS
 * variables drive every surface). This config mirrors the brand kit
 * tokens onto Tailwind's theme so JSX classes like `bg-marigold`,
 * `rounded-cir-lg`, `shadow-cir-md` resolve to the same values without
 * round-tripping through utility class strings.
 *
 * Dark mode toggles via `data-color-mode="dark"` on `<html>` so the
 * lens settings page can flip the whole tree by writing one attribute.
 */
export default {
  darkMode: ['class', '[data-color-mode="dark"]'],
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './lib/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Marigold primary — the warm orange.
        marigold: {
          50: '#fff3ee',
          100: '#ffe1d4',
          200: '#ffc1a8',
          300: '#ff9a76',
          400: '#ff7a52',
          500: '#ff5f3a',
          600: '#e84d2a',
          700: '#cf3f1f',
          800: '#a8311a',
          900: '#812617',
        },
        // Cream surface family.
        cream: {
          50: '#fffaf3',
          100: '#fff3e6',
          200: '#f7ede0',
          300: '#f0e3d2',
          400: '#e6d6c2',
          500: '#c9b59c',
        },
        // Warm-charcoal surface family for dark mode.
        charcoal: {
          50: '#fdf6ec',
          100: '#d8cdbf',
          200: '#a8998a',
          300: '#8a7d70',
          400: '#554a3f',
          500: '#3a3128',
          600: '#2c241c',
          700: '#252019',
          800: '#221d18',
          900: '#1a1714',
        },
        // Confirmation / "added to cart" green.
        confirm: {
          50: '#d6f0e8',
          100: '#aae0d1',
          400: '#34a890',
          500: '#0d8a72',
          600: '#0a6e5a',
        },
        cir: {
          bg: 'var(--cir-color-bg)',
          surface: 'var(--cir-color-bg-surface)',
          subtle: 'var(--cir-color-bg-subtle)',
          card: 'var(--cir-color-bg-card)',
          muted: 'var(--cir-color-bg-muted)',
          fg: 'var(--cir-color-fg)',
          'fg-muted': 'var(--cir-color-fg-muted)',
          primary: 'var(--cir-color-primary)',
          'primary-hover': 'var(--cir-color-primary-hover)',
          success: 'var(--cir-color-success)',
          warning: 'var(--cir-color-warning)',
          danger: 'var(--cir-color-danger)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: [
          'Cabinet Grotesk',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // Anchored to brand-kit `tokens.typography.scale`.
        'cir-xs': ['11px', { lineHeight: '1.4' }],
        'cir-sm': ['12px', { lineHeight: '1.45' }],
        'cir-base': ['14px', { lineHeight: '1.5' }],
        'cir-md': ['15px', { lineHeight: '1.55' }],
        'cir-lg': ['17px', { lineHeight: '1.55' }],
        'cir-xl': ['20px', { lineHeight: '1.4' }],
        'cir-2xl': ['24px', { lineHeight: '1.3' }],
        'cir-3xl': ['30px', { lineHeight: '1.2' }],
        'cir-display': ['36px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
      },
      borderRadius: {
        'cir-xs': '6px',
        'cir-sm': '8px',
        'cir-md': '12px',
        'cir-lg': '16px',
        'cir-xl': '24px',
      },
      boxShadow: {
        'cir-xs': '0 1px 2px 0 rgba(80, 32, 12, 0.04)',
        'cir-sm': '0 1px 3px 0 rgba(80, 32, 12, 0.06), 0 1px 2px 0 rgba(80, 32, 12, 0.04)',
        'cir-md': '0 4px 8px -2px rgba(80, 32, 12, 0.08), 0 2px 4px -2px rgba(80, 32, 12, 0.04)',
        'cir-lg': '0 12px 24px -8px rgba(80, 32, 12, 0.12), 0 4px 8px -4px rgba(80, 32, 12, 0.06)',
        'cir-xl':
          '0 24px 40px -12px rgba(80, 32, 12, 0.18), 0 8px 16px -8px rgba(80, 32, 12, 0.08)',
      },
      transitionDuration: {
        'cir-fast': '140ms',
        'cir-normal': '220ms',
        'cir-slow': '320ms',
      },
      transitionTimingFunction: {
        'cir-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'cir-spring': 'cubic-bezier(0.5, 1.6, 0.4, 1)',
      },
    },
  },
  plugins: [],
};
