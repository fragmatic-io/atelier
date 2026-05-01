// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Brand kit for the dummyjson catalog demo. Distinct from `apps/demo` —
 * this app pitches a colour scheme that reads as "shop": warmer accent,
 * stronger price emphasis colour, neutral surface.
 *
 * Folded into the compiler's system prompt so generated manifests use only
 * on-brand tokens; the runtime's `respects_brand_kit` policy enforces the
 * same as a hard contract.
 */

import type { BrandKit } from '@cir/schemas';

export const DUMMYJSON_BRAND_KIT: BrandKit = {
  id: 'cir.demo-dummyjson',
  version: '0.1.0',
  tokens: {
    colors: {
      'bg.app': '#fafaf9',
      'bg.card': '#ffffff',
      'fg.primary': '#0c0a09',
      'fg.muted': '#78716c',
      'accent.primary': '#7c3aed',
      'accent.success': '#16a34a',
      'accent.warning': '#f59e0b',
      'accent.danger': '#dc2626',
      'price.emphasis': '#0c0a09',
      'price.muted': '#78716c',
    },
    spacing: {
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
    },
    typography: {
      font_stack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
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
      lg: '12px',
      full: '9999px',
    },
  },
  variants: {
    Stack: ['vertical', 'horizontal'],
    Button: ['primary', 'secondary', 'destructive', 'ghost'],
    Alert: ['info', 'success', 'warning', 'error'],
    Container: ['sm', 'md', 'lg', 'full'],
    Card: ['bordered', 'elevated', 'ghost', 'tinted'],
    Grid: ['bordered', 'elevated', 'ghost', 'tinted'],
  },
  voice: {
    tone: 'Crisp, retail-savvy, never pushy. Lead with the product, not the marketing.',
    do: [
      'Use sentence case for product titles and CTAs.',
      'Lead with the noun in CTAs ("Add to cart", not "Click to add to cart").',
      'Quote prices with the currency symbol prefix and two decimals.',
    ],
    dont: [
      'Don\'t use marketing voice ("Don\'t miss out!" "Hurry!").',
      "Don't emoji unless it's a status indicator.",
      "Don't use exclamation points except in error messages.",
    ],
  },
};
