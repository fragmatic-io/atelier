// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Demo-GitHub brand kit. Folded into the compiler's system prompt so
 * generated manifests use only on-brand values; the runtime's
 * `respects_brand_kit` policy enforces the same as a hard contract.
 *
 * Tones and palette are tuned for a code-reviewer's daily queue —
 * GitHub-ish neutrals with a magenta accent so the dashboard reads
 * distinct from apps/demo without changing the underlying token shape.
 */

import type { BrandKit } from '@cir/schemas';

export const DEMO_GITHUB_BRAND_KIT: BrandKit = {
  id: 'cir.demo-github',
  version: '0.1.0',
  tokens: {
    colors: {
      'bg.app': '#0d1117',
      'bg.card': '#161b22',
      'fg.primary': '#f0f6fc',
      'fg.muted': '#8b949e',
      'accent.primary': '#d946ef',
      'accent.success': '#3fb950',
      'accent.warning': '#d29922',
      'accent.danger': '#f85149',
    },
    spacing: {
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
    },
    typography: {
      font_stack: 'ui-sans-serif, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      scale: {
        xs: '11px',
        sm: '12px',
        base: '14px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      weight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
    },
    radius: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      full: '9999px',
    },
  },
  variants: {
    Stack: ['vertical', 'horizontal'],
    Button: ['primary', 'secondary', 'destructive', 'ghost'],
    Alert: ['info', 'success', 'warning', 'error'],
    Container: ['sm', 'md', 'lg', 'full'],
  },
  voice: {
    tone: 'Direct, terse, code-reviewer-flavoured. Issues are issues; do not soften them.',
    do: [
      'Use sentence case for headings and buttons.',
      'Lead with the verb in calls to action ("Close issue", not "Click here to close").',
      'Reference issues by `#number` so users can pattern-match them at a glance.',
    ],
    dont: [
      "Don't use marketing voice in error messages.",
      "Don't emoji unless the brand voice already uses one for status.",
      "Don't print or log the GitHub token even on debug paths.",
    ],
  },
};
