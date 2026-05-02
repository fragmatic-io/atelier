// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Octant Tailwind config for `apps/demo-github`.
 *
 * Tailwind v4 reads its config from `@import 'tailwindcss';` in
 * `globals.css` plus this file. The CSS-variable bridge in `globals.css`
 * is the canonical source of design tokens; this file is a thin
 * pass-through that:
 *
 *   1. Switches `darkMode` to a class/attribute selector keyed off
 *      `[data-color-mode='dark']` on `<html>` so the BrandKit's
 *      light/dark elevation pairs map to the same selector the runtime
 *      flips on the `intent.global_preferences.color_mode` toggle.
 *
 *   2. Maps brand tokens into the `theme` namespace so authors can write
 *      `bg-brand` / `text-accent` / `rounded-md` without reaching into
 *      raw hex.
 */

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ['class', '[data-color-mode="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/components/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: 'var(--cir-color-brand)',
        'brand-fg': 'var(--cir-color-brand-fg)',
        accent: 'var(--cir-color-accent)',
        canvas: 'var(--cir-color-bg)',
        'canvas-card': 'var(--cir-color-bg-card)',
        'canvas-muted': 'var(--cir-color-bg-muted)',
        ink: 'var(--cir-color-fg)',
        'ink-muted': 'var(--cir-color-fg-muted)',
        'ink-subtle': 'var(--cir-color-fg-subtle)',
        success: 'var(--cir-color-success)',
        warning: 'var(--cir-color-warning)',
        danger: 'var(--cir-color-danger)',
      },
      borderRadius: {
        xs: 'var(--cir-radius-xs)',
        sm: 'var(--cir-radius-sm)',
        md: 'var(--cir-radius-md)',
        lg: 'var(--cir-radius-lg)',
      },
      boxShadow: {
        resting: 'var(--cir-shadow-resting)',
        hover: 'var(--cir-shadow-hover)',
        popover: 'var(--cir-shadow-popover)',
        modal: 'var(--cir-shadow-modal)',
        commandbar: 'var(--cir-shadow-commandbar)',
      },
      fontFamily: {
        sans: 'var(--cir-font-sans)',
        mono: 'var(--cir-font-mono)',
      },
      transitionDuration: {
        fast: '80ms',
        normal: '120ms',
        slow: '200ms',
      },
    },
  },
};

export default config;
