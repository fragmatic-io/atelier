// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import type { BrandKit } from '@atelier/schemas';

export type BrandCssVariableName = `--atelier-${string}`;
export type BrandCssVariables = Record<BrandCssVariableName, string>;

const SEMANTIC_COLOR_KEYS = {
  bgApp: 'bg.app',
  bgSurface: 'bg.surface',
  bgSubtle: 'bg.subtle',
  bgCard: 'bg.card',
  bgMuted: 'bg.muted',
  fgPrimary: 'fg.primary',
  fgSecondary: 'fg.secondary',
  fgMuted: 'fg.muted',
  fgSubtle: 'fg.subtle',
  fgOnPrimary: 'fg.on_primary',
  accentPrimary: 'accent.primary',
  accentPrimaryHover: 'accent.primary_hover',
  accentSuccess: 'accent.success',
  accentWarning: 'accent.warning',
  accentDanger: 'accent.danger',
  accentInfo: 'accent.info',
  borderSubtle: 'border.subtle',
  borderDefault: 'border.default',
  borderStrong: 'border.strong',
  borderFocus: 'border.focus',
} as const;

const SEMANTIC_VAR_NAMES = {
  bgApp: '--atelier-bg-app',
  bgSurface: '--atelier-bg-surface',
  bgSubtle: '--atelier-bg-subtle',
  bgCard: '--atelier-bg-card',
  bgMuted: '--atelier-bg-muted',
  fgPrimary: '--atelier-fg-primary',
  fgSecondary: '--atelier-fg-secondary',
  fgMuted: '--atelier-fg-muted',
  fgSubtle: '--atelier-fg-subtle',
  fgOnPrimary: '--atelier-fg-on-primary',
  accentPrimary: '--atelier-accent-primary',
  accentPrimaryHover: '--atelier-accent-primary-hover',
  accentSuccess: '--atelier-accent-success',
  accentWarning: '--atelier-accent-warning',
  accentDanger: '--atelier-accent-danger',
  accentInfo: '--atelier-accent-info',
  borderSubtle: '--atelier-border-subtle',
  borderDefault: '--atelier-border-default',
  borderStrong: '--atelier-border-strong',
  borderFocus: '--atelier-border-focus',
} satisfies Record<keyof typeof SEMANTIC_COLOR_KEYS, BrandCssVariableName>;

const TYPOGRAPHY_VAR_NAMES = {
  fontStack: '--atelier-font-sans',
} satisfies Record<'fontStack', BrandCssVariableName>;

export function brandKitToCssVars(brandKit: BrandKit): BrandCssVariables {
  const vars: BrandCssVariables = {};
  const colors = brandKit.tokens.colors;

  for (const [name, key] of typedEntries(SEMANTIC_COLOR_KEYS)) {
    assignVar(vars, SEMANTIC_VAR_NAMES[name], colors[key]);
  }

  assignVar(vars, TYPOGRAPHY_VAR_NAMES.fontStack, brandKit.tokens.typography.font_stack);
  assignTokenScale(vars, 'color', colors);
  assignTokenScale(vars, 'space', brandKit.tokens.spacing);
  assignTokenScale(vars, 'type', brandKit.tokens.typography.scale);
  assignTokenScale(vars, 'font-weight', brandKit.tokens.typography.weight);
  assignTokenScale(vars, 'tracking', brandKit.tokens.typography.letter_spacing);
  assignTokenScale(vars, 'leading', brandKit.tokens.typography.line_height);
  assignTokenScale(vars, 'radius', brandKit.tokens.radius);
  assignTokenScale(vars, 'shadow', brandKit.tokens.shadow);

  if (brandKit.tokens.motion !== undefined) {
    assignTokenScale(vars, 'duration', brandKit.tokens.motion.duration);
    assignTokenScale(vars, 'easing', brandKit.tokens.motion.easing);
  }

  if (brandKit.motion !== undefined) {
    for (const [key, value] of Object.entries(brandKit.motion.duration_scale)) {
      assignVar(vars, `--atelier-motion-duration-${toCssTokenName(key)}`, `${String(value)}ms`);
    }
    assignTokenScale(vars, 'motion-easing', brandKit.motion.easing);
  }

  assignTokenScale(vars, 'radius-scale', brandKit.radius_scale);
  assignTokenScale(vars, 'shadow-scale', brandKit.shadow_scale);

  return vars;
}

export function toCssTokenName(key: string): string {
  return key
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function assignTokenScale(
  vars: BrandCssVariables,
  namespace: string,
  scale: Readonly<Record<string, string>> | undefined,
): void {
  if (scale === undefined) return;

  for (const [key, value] of Object.entries(scale)) {
    assignVar(vars, `--atelier-${namespace}-${toCssTokenName(key)}`, value);
  }
}

function assignVar(
  vars: BrandCssVariables,
  name: BrandCssVariableName,
  value: string | undefined,
): void {
  if (value === undefined || value.length === 0) return;
  vars[name] = value;
}

function typedEntries<T extends Readonly<Record<string, string>>>(
  value: T,
): Array<[keyof T, T[keyof T]]> {
  return Object.entries(value) as Array<[keyof T, T[keyof T]]>;
}
