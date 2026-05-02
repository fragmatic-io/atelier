// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Brand kit for the dummyjson catalog demo — the **"Marigold"** theme.
 *
 * Marigold is a warm, light-mode-primary e-commerce identity. The pitch:
 * Stripe Checkout meets Shopify Polaris. Generous radii, soft warm
 * shadows, an energetic orange primary, a calm cream surface, and a
 * deep blue-green accent for confirmations ("added to cart").
 *
 *  - **Primary**            `#ff5f3a`  — warm orange, retail energy.
 *  - **Surface (light)**    `#fffaf3`  — cream.
 *  - **Surface (dark)**     `#1a1714`  — warm charcoal.
 *  - **Accent**             `#0d8a72`  — deep blue-green, confirmations.
 *  - **Destructive**        `#dc2626`  — vivid red.
 *  - **Sans**               Inter (system fallback).
 *  - **Display**            system-ui semibold (future: Cabinet Grotesk).
 *  - **Mono**               JetBrains Mono (SKUs / order numbers).
 *  - **Radius**             generous 8/12/16/24 px scale.
 *  - **Shadow**             soft, with a slight orange undertone in light.
 *  - **Motion**             smooth, slightly bouncy (140 / 220 / 320 ms).
 *
 * Folded into the compiler's system prompt so generated manifests use
 * only on-brand tokens; the runtime's `respects_brand_kit` policy enforces
 * the same as a hard contract.
 */

import type { BrandKit } from '@atelier/schemas';

export const DUMMYJSON_BRAND_KIT: BrandKit = {
  id: 'cir.demo-dummyjson',
  version: '0.2.0',
  tokens: {
    colors: {
      // Surfaces (light primary; dark mirror keys are prefixed `dark.*`).
      'bg.app': '#fffaf3',
      'bg.surface': '#ffffff',
      'bg.subtle': '#fff3e6',
      'bg.card': '#ffffff',
      'bg.muted': '#f7ede0',
      'dark.bg.app': '#1a1714',
      'dark.bg.surface': '#221d18',
      'dark.bg.card': '#252019',
      // Foreground.
      'fg.primary': '#1a1714',
      'fg.secondary': '#554a3f',
      'fg.muted': '#8a7d70',
      'fg.subtle': '#b3a89c',
      'fg.on_primary': '#ffffff',
      'dark.fg.primary': '#fdf6ec',
      'dark.fg.muted': '#a8998a',
      // Accent / brand.
      'accent.primary': '#ff5f3a',
      'accent.primary_hover': '#e84d2a',
      'accent.primary_active': '#cf3f1f',
      'accent.success': '#0d8a72',
      'accent.success_subtle': '#d6f0e8',
      'accent.warning': '#f59e0b',
      'accent.danger': '#dc2626',
      'accent.info': '#0e7490',
      // Price / commerce-specific.
      'price.emphasis': '#1a1714',
      'price.muted': '#8a7d70',
      'price.sale': '#dc2626',
      'price.savings': '#0d8a72',
      // Border.
      'border.subtle': '#f0e3d2',
      'border.default': '#e6d6c2',
      'border.strong': '#c9b59c',
      'border.focus': '#ff5f3a',
    },
    spacing: {
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
      '2xl': '48px',
      '3xl': '64px',
    },
    typography: {
      // Inter via system fallback. The deployment target ships Inter
      // through @next/font; this string still resolves to a usable stack
      // when no font is preloaded.
      font_stack:
        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      scale: {
        xs: '11px',
        sm: '12px',
        base: '14px',
        md: '15px',
        lg: '17px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
        display: '36px',
      },
      weight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        display: '700',
      },
    },
    motion: {
      duration: {
        fast: '140ms',
        normal: '220ms',
        slow: '320ms',
      },
      easing: {
        in_out: 'cubic-bezier(0.4, 0, 0.2, 1)',
        out: 'cubic-bezier(0.0, 0, 0.2, 1)',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        spring: 'cubic-bezier(0.5, 1.6, 0.4, 1)',
      },
    },
    radius: {
      xs: '6px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      full: '9999px',
    },
    shadow: {
      // Warm soft shadows; light mode adds a faint orange undertone via
      // an ultra-low-alpha primary tint. Dark mode strengthens the
      // base black for legibility.
      xs: '0 1px 2px 0 rgba(80, 32, 12, 0.04)',
      sm: '0 1px 3px 0 rgba(80, 32, 12, 0.06), 0 1px 2px 0 rgba(80, 32, 12, 0.04)',
      md: '0 4px 8px -2px rgba(80, 32, 12, 0.08), 0 2px 4px -2px rgba(80, 32, 12, 0.04)',
      lg: '0 12px 24px -8px rgba(80, 32, 12, 0.12), 0 4px 8px -4px rgba(80, 32, 12, 0.06)',
      xl: '0 24px 40px -12px rgba(80, 32, 12, 0.18), 0 8px 16px -8px rgba(80, 32, 12, 0.08)',
    },
  },
  variants: {
    Stack: ['vertical', 'horizontal'],
    Button: ['primary', 'secondary', 'destructive', 'ghost'],
    Alert: ['info', 'success', 'warning', 'error'],
    Container: ['sm', 'md', 'lg', 'full'],
    Card: ['bordered', 'elevated', 'ghost', 'tinted'],
    Grid: ['bordered', 'elevated', 'ghost', 'tinted'],
    Wizard: ['default', 'sidebar', 'topbar'],
    Gallery: ['grid', 'masonry', 'carousel'],
    StatCard: ['default', 'accent', 'muted'],
    StatusBar: ['compact', 'default'],
  },
  radius_scale: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  shadow_scale: {
    xs: '0 1px 2px 0 rgba(80, 32, 12, 0.04)',
    sm: '0 1px 3px 0 rgba(80, 32, 12, 0.06), 0 1px 2px 0 rgba(80, 32, 12, 0.04)',
    md: '0 4px 8px -2px rgba(80, 32, 12, 0.08), 0 2px 4px -2px rgba(80, 32, 12, 0.04)',
    lg: '0 12px 24px -8px rgba(80, 32, 12, 0.12), 0 4px 8px -4px rgba(80, 32, 12, 0.06)',
    xl: '0 24px 40px -12px rgba(80, 32, 12, 0.18), 0 8px 16px -8px rgba(80, 32, 12, 0.08)',
  },
  elevation_scale: {
    resting: {
      light: 'none',
      dark: 'none',
    },
    hover: {
      light: '0 2px 6px -1px rgba(80, 32, 12, 0.10), 0 1px 2px 0 rgba(80, 32, 12, 0.05)',
      dark: '0 2px 6px -1px rgba(0, 0, 0, 0.45), 0 1px 2px 0 rgba(0, 0, 0, 0.30)',
    },
    popover: {
      light: '0 8px 16px -4px rgba(80, 32, 12, 0.14), 0 4px 8px -4px rgba(80, 32, 12, 0.08)',
      dark: '0 8px 16px -4px rgba(0, 0, 0, 0.55), 0 4px 8px -4px rgba(0, 0, 0, 0.35)',
    },
    modal: {
      light: '0 20px 40px -12px rgba(80, 32, 12, 0.22), 0 8px 16px -8px rgba(80, 32, 12, 0.10)',
      dark: '0 20px 40px -12px rgba(0, 0, 0, 0.65), 0 8px 16px -8px rgba(0, 0, 0, 0.40)',
    },
    commandbar: {
      light: '0 32px 64px -16px rgba(80, 32, 12, 0.30), 0 12px 24px -12px rgba(80, 32, 12, 0.16)',
      dark: '0 32px 64px -16px rgba(0, 0, 0, 0.75), 0 12px 24px -12px rgba(0, 0, 0, 0.50)',
    },
  },
  motion: {
    duration_scale: {
      fast: 140,
      normal: 220,
      slow: 320,
    },
    easing: {
      in_out: 'cubic-bezier(0.4, 0, 0.2, 1)',
      out: 'cubic-bezier(0.0, 0, 0.2, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      spring: 'cubic-bezier(0.5, 1.6, 0.4, 1)',
    },
  },
  iconography: {
    // Phosphor's rounded silhouette pairs with the chunky display + 8/12/16/24
    // radius scale better than Lucide's hairline geometry.
    allowed_sets: ['phosphor'],
    minimum_size: 16,
  },
  accessibility: {
    contrast_minimum: 4.5,
    focus_ring_required: true,
  },
  voice: {
    tone: 'Warm and helpful. Lead with the product. Never push.',
    do: [
      'Use plain language — write the way a friend would describe a product.',
      'Lead with the benefit ("Free returns within 30 days"), not the obligation.',
      'Keep sentences short. Verbs first in CTAs ("Add to cart", "Save for later").',
      'Quote prices with the currency symbol prefix and two decimals.',
    ],
    dont: [
      'Don\'t hard-sell — no "Buy now!", no "Hurry!", no "Don\'t miss out!"',
      "Don't use urgency manipulation — countdowns or scarcity claims need to be true.",
      "Don't use ALL-CAPS for emphasis. Bold the noun instead.",
      "Don't punctuate with multiple exclamation points.",
    ],
    surfaces: {
      button: {
        tone: 'inviting',
        example: 'Add to cart',
      },
      error: {
        tone: 'reassuring',
        example: "Couldn't load that — try again in a moment.",
      },
      empty_state: {
        tone: 'encouraging',
        example: 'Nothing here yet. Browse the catalog to start.',
      },
      marketing: {
        tone: 'warm and specific',
        example: 'Hand-picked picks for kitchens that get used every day.',
      },
      confirmation: {
        tone: 'celebratory but quiet',
        example: 'Added to cart — undo for the next 5 seconds.',
      },
    },
  },
};
