// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Demo brand kit. Folded into the compiler's system prompt so generated
 * manifests use only on-brand values; the runtime's `respects_brand_kit`
 * policy enforces the same as a hard contract.
 *
 * In a real deployment this would live at `/.well-known/brand-kit.json`,
 * signed by the app, and bumped via semver.
 */

import type { BrandKit } from '@cir/schemas';

export const DEMO_BRAND_KIT: BrandKit = {
  id: 'cir.demo',
  version: '0.1.0',
  tokens: {
    colors: {
      'bg.app': '#f9fafb',
      'bg.card': '#ffffff',
      'fg.primary': '#111827',
      'fg.muted': '#6b7280',
      'accent.primary': '#3b82f6',
      'accent.success': '#10b981',
      'accent.warning': '#f59e0b',
      'accent.danger': '#ef4444',
    },
    spacing: {
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
    },
    typography: {
      font_stack: 'system-ui, -apple-system, sans-serif',
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
    tone: "Direct, terse, action-oriented. The reader is busy. Don't pad.",
    do: [
      'Use sentence case for headings and buttons.',
      'Lead with the verb in calls to action ("Archive thread", not "Click here to archive").',
      'Quote dates concisely (Tue 2pm, not "Tuesday at 2:00 PM").',
    ],
    dont: [
      'Don\'t use marketing voice ("Awesome!" "We can\'t wait to ...").',
      "Don't emoji unless it's a status indicator.",
      "Don't use exclamation points except in error messages.",
    ],
  },
};
