// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import type { BrandKit } from '@atelier/schemas';

const INTERNAL_TOOL_VARIANTS = Object.freeze({
  Stack: ['vertical', 'horizontal'],
  Button: ['primary', 'secondary', 'destructive', 'ghost', 'outline'],
  Alert: ['info', 'success', 'warning', 'error'],
  Container: ['sm', 'md', 'lg', 'full'],
  Card: ['bordered', 'elevated', 'ghost', 'tinted'],
  Grid: ['bordered', 'elevated', 'ghost', 'tinted'],
  Wizard: ['default', 'sidebar', 'topbar'],
  Gallery: ['grid', 'masonry', 'carousel'],
  StatCard: ['default', 'accent', 'muted'],
  StatusBar: ['compact', 'default'],
}) satisfies BrandKit['variants'];

export const neutralBrandKit = Object.freeze({
  id: 'atelier.design.neutral',
  version: '0.1.0',
  tokens: {
    colors: {
      'bg.app': '#f8fafc',
      'bg.surface': '#ffffff',
      'bg.subtle': '#f1f5f9',
      'bg.card': '#ffffff',
      'bg.muted': '#e2e8f0',
      'fg.primary': '#0f172a',
      'fg.secondary': '#334155',
      'fg.muted': '#64748b',
      'fg.subtle': '#94a3b8',
      'fg.on_primary': '#ffffff',
      'accent.primary': '#2563eb',
      'accent.primary_hover': '#1d4ed8',
      'accent.success': '#0f766e',
      'accent.warning': '#b45309',
      'accent.danger': '#dc2626',
      'accent.info': '#0369a1',
      'border.subtle': '#e2e8f0',
      'border.default': '#cbd5e1',
      'border.strong': '#94a3b8',
      'border.focus': '#2563eb',
    },
    spacing: {
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
      '2xl': '48px',
    },
    typography: {
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
        display: '32px',
      },
      weight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      line_height: {
        tight: '1.2',
        normal: '1.5',
        loose: '1.7',
      },
      opentype: {
        tabular_numerals: true,
        ligatures: 'common',
      },
    },
    motion: {
      duration: {
        fast: '120ms',
        normal: '180ms',
        slow: '260ms',
      },
      easing: {
        in_out: 'cubic-bezier(0.4, 0, 0.2, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
    radius: {
      xs: '2px',
      sm: '4px',
      md: '6px',
      lg: '8px',
      full: '9999px',
    },
    shadow: {
      sm: '0 1px 2px 0 rgba(15, 23, 42, 0.06)',
      md: '0 8px 24px -18px rgba(15, 23, 42, 0.42)',
      lg: '0 18px 48px -28px rgba(15, 23, 42, 0.46)',
    },
  },
  variants: INTERNAL_TOOL_VARIANTS,
  radius_scale: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
  shadow_scale: {
    sm: '0 1px 2px 0 rgba(15, 23, 42, 0.06)',
    md: '0 8px 24px -18px rgba(15, 23, 42, 0.42)',
    lg: '0 18px 48px -28px rgba(15, 23, 42, 0.46)',
  },
  motion: {
    duration_scale: {
      fast: 120,
      normal: 180,
      slow: 260,
    },
    easing: {
      in_out: 'cubic-bezier(0.4, 0, 0.2, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
    },
  },
  iconography: {
    allowed_sets: ['lucide'],
    minimum_size: 16,
  },
  accessibility: {
    contrast_minimum: 4.5,
    focus_ring_required: true,
  },
  voice: {
    tone: 'calm, direct, operational',
    do: ['Use concrete labels.', 'Prefer status and action language.', 'Keep UI copy short.'],
    dont: ['Do not use marketing slogans.', 'Do not imply actions completed before audit.'],
  },
} satisfies BrandKit);

export const commerceBrandKit = Object.freeze({
  id: 'atelier.design.commerce',
  version: '0.1.0',
  tokens: {
    colors: {
      'bg.app': '#fffaf3',
      'bg.surface': '#ffffff',
      'bg.subtle': '#fff3e6',
      'bg.card': '#ffffff',
      'bg.muted': '#f7ede0',
      'fg.primary': '#1a1714',
      'fg.secondary': '#554a3f',
      'fg.muted': '#8a7d70',
      'fg.subtle': '#b3a89c',
      'fg.on_primary': '#ffffff',
      'accent.primary': '#ff5f3a',
      'accent.primary_hover': '#e84d2a',
      'accent.success': '#0d8a72',
      'accent.warning': '#b45309',
      'accent.danger': '#dc2626',
      'accent.info': '#0e7490',
      'border.subtle': '#f0e3d2',
      'border.default': '#e6d6c2',
      'border.strong': '#c9b59c',
      'border.focus': '#ff5f3a',
    },
    spacing: neutralBrandKit.tokens.spacing,
    typography: {
      ...neutralBrandKit.tokens.typography,
      scale: {
        ...neutralBrandKit.tokens.typography.scale,
        display: '36px',
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
        out: 'cubic-bezier(0, 0, 0.2, 1)',
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
      sm: '0 1px 3px 0 rgba(80, 32, 12, 0.06), 0 1px 2px 0 rgba(80, 32, 12, 0.04)',
      md: '0 4px 8px -2px rgba(80, 32, 12, 0.08), 0 2px 4px -2px rgba(80, 32, 12, 0.04)',
      lg: '0 12px 24px -8px rgba(80, 32, 12, 0.12), 0 4px 8px -4px rgba(80, 32, 12, 0.06)',
    },
  },
  variants: INTERNAL_TOOL_VARIANTS,
  radius_scale: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  shadow_scale: {
    sm: '0 1px 3px 0 rgba(80, 32, 12, 0.06), 0 1px 2px 0 rgba(80, 32, 12, 0.04)',
    md: '0 4px 8px -2px rgba(80, 32, 12, 0.08), 0 2px 4px -2px rgba(80, 32, 12, 0.04)',
    lg: '0 12px 24px -8px rgba(80, 32, 12, 0.12), 0 4px 8px -4px rgba(80, 32, 12, 0.06)',
  },
  motion: {
    duration_scale: {
      fast: 140,
      normal: 220,
      slow: 320,
    },
    easing: neutralBrandKit.motion.easing,
  },
  iconography: neutralBrandKit.iconography,
  accessibility: neutralBrandKit.accessibility,
  voice: {
    tone: 'clear, warm, service-oriented',
    do: ['Lead with customer impact.', 'Use concise commerce terms.', 'Name reversible actions.'],
    dont: ['Do not sound playful during risk or refund flows.', 'Do not obscure costs.'],
  },
} satisfies BrandKit);

export const consoleBrandKit = Object.freeze({
  id: 'atelier.design.console',
  version: '0.1.0',
  tokens: {
    colors: {
      'bg.app': '#0b1020',
      'bg.surface': '#111827',
      'bg.subtle': '#172033',
      'bg.card': '#101624',
      'bg.muted': '#1f2937',
      'fg.primary': '#f8fafc',
      'fg.secondary': '#cbd5e1',
      'fg.muted': '#94a3b8',
      'fg.subtle': '#64748b',
      'fg.on_primary': '#061018',
      'accent.primary': '#38bdf8',
      'accent.primary_hover': '#7dd3fc',
      'accent.success': '#34d399',
      'accent.warning': '#fbbf24',
      'accent.danger': '#fb7185',
      'accent.info': '#60a5fa',
      'border.subtle': '#1e293b',
      'border.default': '#334155',
      'border.strong': '#475569',
      'border.focus': '#38bdf8',
    },
    spacing: neutralBrandKit.tokens.spacing,
    typography: {
      ...neutralBrandKit.tokens.typography,
      font_stack:
        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    },
    motion: {
      duration: {
        fast: '90ms',
        normal: '140ms',
        slow: '220ms',
      },
      easing: neutralBrandKit.tokens.motion.easing,
    },
    radius: {
      xs: '2px',
      sm: '3px',
      md: '4px',
      lg: '6px',
      full: '9999px',
    },
    shadow: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
      md: '0 12px 28px -20px rgba(0, 0, 0, 0.75)',
      lg: '0 22px 54px -30px rgba(0, 0, 0, 0.85)',
    },
  },
  variants: INTERNAL_TOOL_VARIANTS,
  radius_scale: {
    xs: '2px',
    sm: '3px',
    md: '4px',
    lg: '6px',
  },
  shadow_scale: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
    md: '0 12px 28px -20px rgba(0, 0, 0, 0.75)',
    lg: '0 22px 54px -30px rgba(0, 0, 0, 0.85)',
  },
  motion: {
    duration_scale: {
      fast: 90,
      normal: 140,
      slow: 220,
    },
    easing: neutralBrandKit.motion.easing,
  },
  iconography: neutralBrandKit.iconography,
  accessibility: {
    contrast_minimum: 4.5,
    focus_ring_required: true,
  },
  voice: {
    tone: 'precise, terse, systems-oriented',
    do: [
      'Expose state plainly.',
      'Use exact operational nouns.',
      'Keep destructive copy explicit.',
    ],
    dont: ['Do not use decorative language.', 'Do not hide uncertainty.'],
  },
} satisfies BrandKit);

export const atelierBrandKits = Object.freeze({
  neutral: neutralBrandKit,
  commerce: commerceBrandKit,
  console: consoleBrandKit,
});

export type AtelierBrandKitId = keyof typeof atelierBrandKits;

export const defaultBrandKitId: AtelierBrandKitId = 'neutral';

export function resolveAtelierBrandKit(id: string | undefined): BrandKit {
  if (id !== undefined && Object.hasOwn(atelierBrandKits, id)) {
    return atelierBrandKits[id as AtelierBrandKitId];
  }

  return atelierBrandKits[defaultBrandKitId];
}
