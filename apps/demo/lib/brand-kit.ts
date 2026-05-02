// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Demo brand kit — "Aurora".
 *
 * Aurora is the visual identity of the personalisation showcase. It's tuned
 * to feel like Linear: cool, technical, dark-primary, dense, low-spread
 * shadows, tight radii, fast motion. Inter for sans, JetBrains Mono for code.
 *
 * The kit is folded into the compiler's system prompt so generated manifests
 * use only on-brand values; the runtime's `respects_brand_kit` policy enforces
 * the same as a hard contract. In a real deployment this would live at
 * `/.well-known/brand-kit.json`, signed by the app, and bumped via semver.
 *
 * Layers covered:
 *   - tokens (colors, spacing, typography, motion-light, radius, shadow)
 *   - radius_scale (4 / 6 / 8 / 12 px — Linear's tight rhythm)
 *   - shadow_scale (5 named flat strings — legacy single-mode scale)
 *   - elevation_scale (5 levels × { light, dark }, Wave 7a Vis-7)
 *   - motion (duration_scale + easing curves)
 *   - iconography (lucide allow-list, 14px floor)
 *   - accessibility (WCAG AA contrast, focus ring required)
 *   - voice (imperative + technical, per-surface guidance)
 *   - variants (extension point — empty by design; per-app overrides live in
 *     `apps/demo/app/globals.css` via CSS variables, not in the kit)
 */

import type { BrandKit } from '@atelier/schemas';

/**
 * Aurora colour ramp. Authored as named tokens; the CSS variable layer in
 * `apps/demo/app/globals.css` projects them into `--cir-color-*` vars and
 * pairs them per `data-color-mode`.
 *
 * The accent cyan is reserved for activity / recency signals (e.g. "edited
 * 2m ago", "live"), per the brief. The destructive red is the only warm
 * hue in the system — its scarcity does the work.
 */
const COLORS = {
  // Brand
  'brand.primary': '#6e56cf', // deep purple
  'brand.primary.fg': '#ffffff',
  'brand.accent': '#67e8f9', // cyan — activity / recency
  // Surfaces (light)
  'surface.app.light': '#fafafb',
  'surface.card.light': '#ffffff',
  'surface.muted.light': '#f4f4f6',
  'surface.border.light': '#e5e5ea',
  // Surfaces (dark)
  'surface.app.dark': '#0a0a0c',
  'surface.card.dark': '#1c1c20',
  'surface.muted.dark': '#26262c',
  'surface.border.dark': '#2e2e36',
  // Foreground (light)
  'fg.primary.light': '#1c1c20',
  'fg.muted.light': '#5b5b65',
  'fg.subtle.light': '#8a8a94',
  // Foreground (dark)
  'fg.primary.dark': '#f5f5f7',
  'fg.muted.dark': '#a0a0aa',
  'fg.subtle.dark': '#6a6a74',
  // Semantic
  'state.success': '#34d399',
  'state.warning': '#fbbf24',
  'state.danger': '#e5484d', // warm red
} as const;

/** Tight 4-step radius scale. Matches Linear's "no big rounds anywhere". */
const RADIUS = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
} as const;

/**
 * Single-mode named shadow scale. Kept for backwards-compatibility with the
 * `respects_brand_kit` policy's `shadow_scale` allowed-set; the dual-mode
 * `elevation_scale` below is preferred for new authoring.
 */
const SHADOW = {
  resting: 'none',
  hover: '0 1px 2px rgba(15, 15, 20, 0.06), 0 1px 1px rgba(15, 15, 20, 0.04)',
  popover: '0 4px 12px rgba(15, 15, 20, 0.08), 0 1px 2px rgba(15, 15, 20, 0.04)',
  modal: '0 12px 32px rgba(15, 15, 20, 0.16), 0 2px 6px rgba(15, 15, 20, 0.06)',
  commandbar: '0 24px 64px rgba(15, 15, 20, 0.20), 0 4px 12px rgba(15, 15, 20, 0.08)',
} as const;

/** Fast motion. 0.16 easing scale: fast / normal / slow. */
const MOTION_DURATION = {
  fast: 100,
  normal: 160,
  slow: 240,
} as const;

const MOTION_EASING = {
  in_out: 'cubic-bezier(0.4, 0, 0.2, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const;

/**
 * Inter for sans, JetBrains Mono for code. We register both as system-fallback
 * stacks rather than self-hosted assets; the brief explicitly says no new deps.
 * Hosts that want to register the woff2 face do so in their own globals.css.
 */
const FONT_STACK_SANS = [
  'Inter',
  '"Inter Variable"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(', ');

const FONT_STACK_MONO = [
  '"JetBrains Mono"',
  '"JetBrains Mono Variable"',
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  'monospace',
].join(', ');

export const DEMO_BRAND_KIT: BrandKit = {
  id: 'cir.demo.aurora',
  version: '0.2.0',
  tokens: {
    colors: COLORS,
    spacing: {
      // Dense rhythm. Each step ~1.5x the prior. Stop early — Aurora rarely
      // needs more than 32px of breathing room in a single gap.
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      '2xl': '32px',
    },
    typography: {
      font_stack: FONT_STACK_SANS,
      scale: {
        // 3-step typographic minimum the schema requires (sm / md / lg). The
        // wider scale below is supplementary — components key off these three
        // by name plus the larger steps when they need them.
        sm: '12px',
        md: '14px',
        lg: '16px',
        // Supplementary steps. Re-stating size doesn't violate the schema —
        // `scale` is `Record<string, string>`.
        xs: '11px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
      weight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      // Wave 11 / Vis-1 — typography depth.
      //
      // Letter-spacing: Linear-style — slightly tightened headings, neutral
      // body, optional wide for all-caps labels (status, eyebrows). Values
      // are projected to --cir-tracking-{key} CSS variables.
      letter_spacing: {
        tight: '-0.02em',
        normal: '0',
        wide: '0.04em',
      },
      // Line-height: Linear-tight rhythm. The `normal` step is what
      // <Markdown> body copy and most paragraph slots inherit; `tight`
      // is for dense list rows / table cells; `loose` for marketing copy.
      // Projected to --cir-leading-{key} CSS variables.
      line_height: {
        tight: '1.25',
        normal: '1.5',
        loose: '1.7',
      },
      // OpenType: Linear + Stripe both globally enable `tnum` so every
      // numeric cell aligns vertically. Common ligatures are on by
      // default for body copy. The runtime composes these into a single
      // `font-feature-settings` declaration on :root; <Table> numeric
      // cells and <StatCard> values pick it up via data-tnum="true".
      opentype: {
        tabular_numerals: true,
        ligatures: 'common',
      },
    },
    motion: {
      duration: {
        fast: `${String(MOTION_DURATION.fast)}ms`,
        normal: `${String(MOTION_DURATION.normal)}ms`,
        slow: `${String(MOTION_DURATION.slow)}ms`,
      },
      easing: MOTION_EASING,
    },
    radius: RADIUS,
    shadow: SHADOW,
  },
  /**
   * Variant whitelist extension point. Aurora intentionally inherits the
   * universal `@atelier/components` variant tables (Wave 7b's per-component
   * `*VariantClass` records) — per-app overrides live in `globals.css` via
   * CSS variables, NOT here. Authors who want to extend Aurora with
   * app-specific component variants drop them in this map.
   */
  variants: {},
  voice: {
    tone: 'imperative + technical',
    do: [
      'start with a verb',
      'name the user task',
      'use lowercase for system events',
      'reference dates concisely (Tue 2pm, not "Tuesday at 2:00 PM")',
      'use sentence case for headings and buttons',
    ],
    dont: ['exclamation marks', 'marketing tone', 'apologies'],
    surfaces: {
      button: { tone: 'imperative', example: 'Archive thread' },
      error: {
        tone: 'calm',
        example: "We couldn't reach the server. Try again or contact support.",
      },
      empty_state: {
        tone: 'factual + brief',
        example: 'no PRs awaiting review today',
      },
      heading: {
        tone: 'noun phrase, sentence case',
        example: 'Inbox',
      },
      toast: {
        tone: 'past-tense system event, lowercase',
        example: 'thread archived. undo',
      },
    },
  },
  radius_scale: RADIUS,
  shadow_scale: SHADOW,
  elevation_scale: {
    resting: {
      // Flat by default — Aurora leans on contrast, not lift.
      light: 'none',
      dark: 'none',
    },
    hover: {
      // Barely-there lift. Linear-style.
      light: '0 1px 2px rgba(15, 15, 20, 0.06), 0 1px 1px rgba(15, 15, 20, 0.04)',
      dark: '0 1px 2px rgba(0, 0, 0, 0.50), 0 0 0 1px rgba(255, 255, 255, 0.04)',
    },
    popover: {
      light: '0 4px 12px rgba(15, 15, 20, 0.08), 0 1px 2px rgba(15, 15, 20, 0.04)',
      dark: '0 4px 12px rgba(0, 0, 0, 0.60), 0 0 0 1px rgba(255, 255, 255, 0.06)',
    },
    modal: {
      light: '0 12px 32px rgba(15, 15, 20, 0.16), 0 2px 6px rgba(15, 15, 20, 0.06)',
      dark: '0 12px 32px rgba(0, 0, 0, 0.70), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    },
    commandbar: {
      light: '0 24px 64px rgba(15, 15, 20, 0.20), 0 4px 12px rgba(15, 15, 20, 0.08)',
      dark: '0 24px 64px rgba(0, 0, 0, 0.80), 0 0 0 1px rgba(255, 255, 255, 0.10)',
    },
  },
  motion: {
    duration_scale: {
      fast: MOTION_DURATION.fast,
      normal: MOTION_DURATION.normal,
      slow: MOTION_DURATION.slow,
    },
    easing: MOTION_EASING,
  },
  iconography: {
    allowed_sets: ['lucide'],
    minimum_size: 14,
  },
  accessibility: {
    contrast_minimum: 4.5,
    focus_ring_required: true,
  },
};

/**
 * Re-export the typed kit under the original name for back-compat. The
 * services bag and the `atelier-server` import this name.
 */
export const brandKit = DEMO_BRAND_KIT;

/** Computed convenience: the mono font stack, for runtime callers that want it. */
export const FONT_STACK_MONO_AURORA = FONT_STACK_MONO;
