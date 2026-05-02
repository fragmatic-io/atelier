// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Demo-GitHub brand kit — "Octant".
 *
 * Octant is the visual identity of the issue-triage showcase. It's tuned
 * to feel like an IDE-adjacent tool: GitHub-meets-VS Code, Inter for
 * body, IBM Plex Mono for code refs / shas / issue ids, tight radii,
 * crisp low-opacity shadows, dense rhythm, restrained motion.
 *
 * Both light and dark modes are first-class. Light uses pure `#ffffff`
 * canvases; dark uses GitHub's signature `#0d1117`.
 *
 * The kit is folded into the compiler's system prompt so generated
 * manifests use only on-brand values; the runtime's `respects_brand_kit`
 * policy enforces the same as a hard contract.
 *
 * Layers covered:
 *   - tokens (colors, spacing, typography, motion, radius, shadow)
 *   - radius_scale     (3 / 4 / 6 / 8 — GitHub's tight rhythm)
 *   - shadow_scale     (5 named flat strings — legacy single-mode scale)
 *   - elevation_scale  (5 levels x { light, dark })
 *   - motion           (80 / 120 / 200 ms — minimal animation)
 *   - iconography      (octicons allow-list, 14 px floor)
 *   - accessibility    (WCAG AA contrast, focus ring required)
 *   - voice            (technical + terse; per-surface guidance)
 *   - variants         (Stack, Button, Alert, Container baseline whitelist)
 */

import type { BrandKit } from '@atelier/schemas';

/**
 * Octant colour ramp. Authored as named tokens; the CSS variable layer in
 * `apps/demo-github/app/globals.css` projects them into `--cir-color-*`
 * vars and pairs them per `data-color-mode`.
 *
 * Brand primary is GitHub green `#1f883d`; accent blue `#0969da` is
 * reserved for links and code refs (matches GitHub's link colour).
 * Destructive red `#cf222e` is the only warm hue that lands often;
 * warning amber `#9a6700` is rarer still.
 */
const COLORS = {
  // Brand
  'brand.primary': '#1f883d',
  'brand.primary.fg': '#ffffff',
  'brand.accent': '#0969da', // blue — links / code refs
  // Surfaces (light)
  'surface.app.light': '#ffffff',
  'surface.card.light': '#f6f8fa',
  'surface.muted.light': '#eaeef2',
  'surface.border.light': '#d0d7de',
  // Surfaces (dark)
  'surface.app.dark': '#0d1117',
  'surface.card.dark': '#161b22',
  'surface.muted.dark': '#21262d',
  'surface.border.dark': '#30363d',
  // Foreground (light)
  'fg.primary.light': '#1f2328',
  'fg.muted.light': '#656d76',
  'fg.subtle.light': '#8c959f',
  // Foreground (dark)
  'fg.primary.dark': '#e6edf3',
  'fg.muted.dark': '#7d8590',
  'fg.subtle.dark': '#6e7681',
  // Semantic
  'state.success': '#1a7f37',
  'state.warning': '#9a6700',
  'state.danger': '#cf222e',
} as const;

/** Tight 4-step radius scale. Matches GitHub's "no big rounds anywhere". */
const RADIUS = {
  xs: '3px',
  sm: '4px',
  md: '6px',
  lg: '8px',
} as const;

/**
 * Single-mode named shadow scale. Crisp, low-opacity. Kept for
 * backwards-compatibility with the `respects_brand_kit` policy's
 * `shadow_scale` allowed-set; the dual-mode `elevation_scale` below is
 * preferred for new authoring.
 */
const SHADOW = {
  resting: 'none',
  hover: '0 1px 0 rgba(31, 35, 40, 0.04), 0 1px 2px rgba(31, 35, 40, 0.06)',
  popover: '0 3px 6px rgba(140, 149, 159, 0.15), 0 8px 24px rgba(66, 74, 83, 0.12)',
  modal: '0 8px 24px rgba(140, 149, 159, 0.20)',
  commandbar: '0 16px 32px rgba(31, 35, 40, 0.24)',
} as const;

/** Restrained motion. Sub-200ms across the board. */
const MOTION_DURATION = {
  fast: 80,
  normal: 120,
  slow: 200,
} as const;

const MOTION_EASING = {
  in_out: 'cubic-bezier(0.4, 0, 0.2, 1)',
  linear: 'linear',
} as const;

/**
 * Inter for sans, IBM Plex Mono for code. We register both as
 * system-fallback stacks rather than self-hosted assets; the brief
 * explicitly says no new deps. Hosts that want to register the woff2
 * face do so in their own globals.css.
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
  '"IBM Plex Mono"',
  '"GitHub Mono"',
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  '"Liberation Mono"',
  'monospace',
].join(', ');

export const DEMO_GITHUB_BRAND_KIT: BrandKit = {
  id: 'cir.demo-github.octant',
  version: '0.2.0',
  tokens: {
    colors: COLORS,
    spacing: {
      // Dense rhythm. GitHub's issue list is famously tight.
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
        // 3-step typographic minimum the schema requires (sm / md / lg).
        // Supplementary steps re-stated below — `scale` is freeform.
        sm: '12px',
        md: '14px',
        lg: '16px',
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
  variants: {
    Stack: ['vertical', 'horizontal'],
    Button: ['primary', 'secondary', 'destructive', 'ghost'],
    Alert: ['info', 'success', 'warning', 'error'],
    Container: ['sm', 'md', 'lg', 'full'],
  },
  voice: {
    tone: 'technical + terse',
    do: ['short imperatives', 'use code-style for ids', 'past-tense for completions'],
    dont: ['emoji in copy', 'exclamation marks', 'marketing tone'],
    surfaces: {
      button: { tone: 'imperative', example: 'Close issue' },
      error: {
        tone: 'precise',
        example: 'Failed to fetch issues — rate limit exceeded',
      },
      empty_state: {
        tone: 'factual',
        example: 'No open issues assigned to you.',
      },
      heading: {
        tone: 'noun phrase, sentence case',
        example: 'Today',
      },
      toast: {
        tone: 'past-tense system event, lowercase',
        example: 'issue archived. undo',
      },
    },
  },
  radius_scale: RADIUS,
  shadow_scale: SHADOW,
  elevation_scale: {
    resting: {
      // Flat. GitHub leans on borders, not lift.
      light: 'none',
      dark: 'none',
    },
    hover: {
      light: '0 1px 0 rgba(31, 35, 40, 0.04), 0 1px 2px rgba(31, 35, 40, 0.06)',
      dark: '0 0 0 1px rgba(240, 246, 252, 0.06), 0 1px 2px rgba(0, 0, 0, 0.40)',
    },
    popover: {
      light: '0 3px 6px rgba(140, 149, 159, 0.15), 0 8px 24px rgba(66, 74, 83, 0.12)',
      dark: '0 0 0 1px rgba(240, 246, 252, 0.08), 0 8px 24px rgba(0, 0, 0, 0.60)',
    },
    modal: {
      light: '0 8px 24px rgba(140, 149, 159, 0.20)',
      dark: '0 0 0 1px rgba(240, 246, 252, 0.10), 0 12px 32px rgba(0, 0, 0, 0.70)',
    },
    commandbar: {
      light: '0 16px 32px rgba(31, 35, 40, 0.24)',
      dark: '0 0 0 1px rgba(240, 246, 252, 0.12), 0 24px 48px rgba(0, 0, 0, 0.80)',
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
    allowed_sets: ['octicons'],
    minimum_size: 14,
  },
  accessibility: {
    contrast_minimum: 4.5,
    focus_ring_required: true,
  },
};

/**
 * Re-export the typed kit under the original name for back-compat. The
 * services bag and `atelier-server` import this name.
 */
export const brandKit = DEMO_GITHUB_BRAND_KIT;

/** Computed convenience: the mono font stack, for callers that want it. */
export const FONT_STACK_MONO_OCTANT = FONT_STACK_MONO;

/** Computed convenience: the sans font stack. */
export const FONT_STACK_SANS_OCTANT = FONT_STACK_SANS;
