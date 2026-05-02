// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * BrandKit — the design system contract.
 *
 * The brand kit is the typed bundle of tokens, variant enums, and voice
 * guidelines an app exposes to the compiler. The compiler folds this into
 * its system prompt so generated manifests use only on-brand values; the
 * policy engine enforces it as a runtime guarantee via the
 * `respects_brand_kit` policy.
 *
 * The four layers of brand integration:
 *
 *   1. Component-level — TypeScript variant unions in `@cir/components`
 *      (e.g. `Button.variant: 'primary' | 'secondary' | …`). Off-brand
 *      values can't be typed.
 *
 *   2. Manifest schema — `LayoutNode.props` is typed as
 *      `Record<string, unknown>`; per-component variant whitelists live in
 *      this BrandKit and are checked by the policy engine.
 *
 *   3. Compiler input — `BrandKit` is passed to the compiler service, which
 *      includes it in the cached system prompt: "use only these tokens,
 *      only these variants, this voice."
 *
 *   4. Policy enforcement — the `respects_brand_kit` policy rejects
 *      manifests whose `props.variant` values fall outside the enum or
 *      whose layouts inline raw hex/px instead of token references.
 *
 * A BrandKit is published per-app as part of the public surface (alongside
 * capabilities, skills, components). It is signed and versioned just like
 * the rest of the public surface.
 *
 * Wave 6 (P-6) extensions: brand kits now describe more of the visual
 * language so the compiler can drive a designed-feeling UI without
 * resorting to inline values. New top-level optional fields:
 *
 *   - `radius_scale`     Named radii (e.g. `{ sm: '4px', md: '8px' }`).
 *                        Inline `border-radius` props must reference one.
 *   - `shadow_scale`     Named CSS shadow strings.
 *   - `motion`           Animation duration scale (ms) and easing curves.
 *   - `iconography`      Allowed icon set ids and a minimum touch size (px).
 *   - `voice.surfaces`   Per-surface voice guidance keyed by surface name
 *                        (`button`, `error`, `marketing`, …).
 *   - `accessibility`    Contrast minimum + focus-ring required flag.
 *
 * All extensions are additive and optional. Existing brand kits without
 * them keep validating; the `respects_brand_kit` policy only enforces the
 * extensions when they are present in the kit AND the manifest carries
 * the relevant inline value.
 */

import { z } from 'zod';
import { CompileBudgetSchema } from './intent.js';

const TokenScale = z.record(z.string(), z.string());

/**
 * Wave 11 / Vis-1: OpenType feature flags. Brand kits opt into typographic
 * features the renderer projects to `font-feature-settings` on the body. All
 * flags are optional and default off — pre-existing kits stay valid.
 *
 * Feature tags follow the OpenType registry:
 *   - `tnum` (tabular numerals) — fixed-width digits for numeric cells
 *   - `liga` / `dlig` — common / discretionary ligatures
 *   - `opsz` (optical sizing) — variable-font feature; size-aware glyph forms
 *   - `frac` — replace `1/2`-style strings with rendered fractions
 *   - `sups` / `subs` — superscript / subscript figure substitution
 *
 * Reference: Linear and Stripe both globally enable `tnum` so every numeric
 * cell aligns vertically; we expose the same affordance per-app.
 */
export const BrandOpenTypeSchema = z.object({
  /** `tnum` — fixed-width digits. Component opt-ins (e.g. `<Table>` numeric cells) consume this flag. */
  tabular_numerals: z.boolean().optional(),
  /** `liga` / `dlig` — common, discretionary, or none. */
  ligatures: z.enum(['common', 'discretionary', 'none']).optional(),
  /** `opsz` — variable-fonts only. */
  optical_sizing: z.boolean().optional(),
  /** `frac` — fraction substitution. */
  fractions: z.boolean().optional(),
  /** `sups` — superscript figure substitution. */
  superscript: z.boolean().optional(),
  /** `subs` — subscript figure substitution. */
  subscript: z.boolean().optional(),
});
export type BrandOpenType = z.infer<typeof BrandOpenTypeSchema>;

export const BrandTokensSchema = z.object({
  colors: TokenScale,
  spacing: TokenScale,
  typography: z.object({
    font_stack: z.string(),
    scale: TokenScale,
    weight: TokenScale.optional(),
    /**
     * Wave 11 / Vis-1: letter-spacing scale per step (e.g.
     * `{ tight: '-0.02em', normal: '0', wide: '0.04em' }`). Optional —
     * existing kits without it stay valid; the runtime projects each entry
     * to a `--cir-tracking-{key}` CSS variable.
     */
    letter_spacing: TokenScale.optional(),
    /**
     * Wave 11 / Vis-1: line-height scale per step (e.g.
     * `{ tight: '1.2', normal: '1.5', loose: '1.75' }`). Values are unitless
     * multipliers (or any valid CSS line-height string). Projected to
     * `--cir-leading-{key}` CSS variables.
     */
    line_height: TokenScale.optional(),
    /**
     * Wave 11 / Vis-1: OpenType feature flag map. The runtime composes a
     * `font-feature-settings` declaration from the active flags and applies
     * it at the document root. Components opt in via attribute markers (e.g.
     * `data-tnum="true"` on numeric cells in `<Table>` / `<KPIRow>`).
     */
    opentype: BrandOpenTypeSchema.optional(),
  }),
  motion: z
    .object({
      duration: TokenScale,
      easing: TokenScale,
    })
    .optional(),
  radius: TokenScale.optional(),
  shadow: TokenScale.optional(),
});
export type BrandTokens = z.infer<typeof BrandTokensSchema>;

export const BrandVariantsSchema = z.record(z.string(), z.array(z.string()).readonly());
export type BrandVariants = z.infer<typeof BrandVariantsSchema>;

/**
 * Per-surface voice guidance. The key is a surface name (`button`, `error`,
 * `marketing`, `empty_state`, …). The value is a tone string and an optional
 * exemplar copy snippet the compiler can lean on.
 */
export const BrandVoiceSurfaceSchema = z.object({
  tone: z.string().min(1),
  example: z.string().optional(),
});
export type BrandVoiceSurface = z.infer<typeof BrandVoiceSurfaceSchema>;

export const BrandVoiceSchema = z.object({
  tone: z.string(),
  do: z.array(z.string()),
  dont: z.array(z.string()),
  /**
   * Optional per-surface guidance. When present, the compiler can pick the
   * surface tone for a layout node based on its semantic role (e.g.
   * `Button` -> `surfaces.button.tone`).
   */
  surfaces: z.record(z.string(), BrandVoiceSurfaceSchema).optional(),
});
export type BrandVoice = z.infer<typeof BrandVoiceSchema>;

/**
 * Named radius scale (e.g. `{ xs: '2px', sm: '4px', md: '8px' }`). Values are
 * CSS length strings. The `respects_brand_kit` policy rejects inline
 * `border-radius` props whose value isn't in this map.
 */
export const BrandRadiusScaleSchema = TokenScale;
export type BrandRadiusScale = z.infer<typeof BrandRadiusScaleSchema>;

/**
 * Named CSS box-shadow strings. Inline `box-shadow` props must match one of
 * these values verbatim. Authors can encode the same shadow under multiple
 * keys if a single visual ships under different names (e.g. `card`, `md`).
 */
export const BrandShadowScaleSchema = TokenScale;
export type BrandShadowScale = z.infer<typeof BrandShadowScaleSchema>;

/**
 * Wave 7a (Vis-7): paired light/dark CSS box-shadow recipes for one
 * elevation level. Both pairs must be authored — a kit that wants to opt
 * out of dark mode can repeat the same string in `dark`.
 */
export const ElevationLevelSchema = z.object({
  light: z.string().min(1),
  dark: z.string().min(1),
});
export type ElevationLevel = z.infer<typeof ElevationLevelSchema>;

/**
 * Five-step elevation token scale. Each level pairs a light-mode and a
 * dark-mode CSS `box-shadow` recipe. Inline `box-shadow` props on
 * manifests must match one of the 10 strings exactly when this scale is
 * declared (see `respects_brand_kit`).
 *
 *   - `resting`    flat surface (often `none`)
 *   - `hover`      subtle lift on interactive elements
 *   - `popover`    dropdowns, hovercards
 *   - `modal`      modals, drawers
 *   - `commandbar` top-of-stack: command palette, toasts
 */
export const ElevationScaleSchema = z.object({
  resting: ElevationLevelSchema,
  hover: ElevationLevelSchema,
  popover: ElevationLevelSchema,
  modal: ElevationLevelSchema,
  commandbar: ElevationLevelSchema,
});
export type ElevationScale = z.infer<typeof ElevationScaleSchema>;
export type ElevationKey = keyof ElevationScale;

/**
 * Motion design tokens. Durations are integers in milliseconds; easing values
 * are CSS timing-function strings (`cubic-bezier(...)`, `ease-in`, etc.).
 */
export const BrandMotionSchema = z.object({
  duration_scale: z.record(z.string(), z.number().int().nonnegative()),
  easing: z.record(z.string(), z.string()).optional(),
});
export type BrandMotion = z.infer<typeof BrandMotionSchema>;

/**
 * Iconography rules. `allowed_sets` lists icon-pack identifiers (`lucide`,
 * `phosphor`, `heroicons`, …); the compiler must source icons from one of
 * them. `minimum_size` is the smallest pixel dimension a rendered icon may
 * use (defaults are advisory — the policy enforces only what's declared).
 */
export const BrandIconographySchema = z.object({
  allowed_sets: z.array(z.string().min(1)).min(1),
  // Use `.min(1)` rather than `.positive()`. `.positive()` would emit a
  // draft-04-style `exclusiveMinimum: true` that the project's Ajv 2019-09
  // pipeline rejects when validating data files (see
  // `cli/index.ts` validateData). Practically equivalent for icon pixel
  // sizes — the values are always integers, never fractional.
  minimum_size: z.number().int().min(1),
});
export type BrandIconography = z.infer<typeof BrandIconographySchema>;

/**
 * Accessibility minimums. `contrast_minimum` is a WCAG-style ratio (4.5 for
 * AA body text, 7 for AAA). `focus_ring_required` flags layouts that suppress
 * the default focus outline without a replacement.
 */
export const BrandAccessibilitySchema = z.object({
  // `.min(1)` because the smallest meaningful contrast ratio is 1 (identical
  // colours). `.positive()` would emit a draft-04 `exclusiveMinimum: true`
  // shape Ajv 2019-09 rejects.
  contrast_minimum: z.number().min(1),
  focus_ring_required: z.boolean(),
});
export type BrandAccessibility = z.infer<typeof BrandAccessibilitySchema>;

export const BrandKitSchema = z.object({
  /** Stable id; published at /.well-known/brand-kit.json. */
  id: z.string().min(1),
  /** Semver — bumping evicts manifests compiled against the prior version. */
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  tokens: BrandTokensSchema,
  variants: BrandVariantsSchema,
  voice: BrandVoiceSchema,
  /** Optional named radius scale. See `BrandRadiusScaleSchema`. */
  radius_scale: BrandRadiusScaleSchema.optional(),
  /** Optional named CSS shadow scale. See `BrandShadowScaleSchema`. */
  shadow_scale: BrandShadowScaleSchema.optional(),
  /**
   * Optional five-step elevation scale (resting / hover / popover / modal /
   * commandbar) with paired light + dark CSS shadow recipes. Wave 7a (Vis-7):
   * preferred over `shadow_scale` for new kits; both can coexist.
   */
  elevation_scale: ElevationScaleSchema.optional(),
  /** Optional motion tokens (durations + easing). See `BrandMotionSchema`. */
  motion: BrandMotionSchema.optional(),
  /** Optional iconography rules. See `BrandIconographySchema`. */
  iconography: BrandIconographySchema.optional(),
  /** Optional accessibility minimums. See `BrandAccessibilitySchema`. */
  accessibility: BrandAccessibilitySchema.optional(),
  /**
   * Optional host-level compile cost budget. Acts as the **safety net** —
   * a per-app ceiling that no user can blow past, regardless of what their
   * `IntentProfile.compile_budget` allows.
   *
   * When both intent AND BrandKit declare a budget, the **stricter** value
   * wins per dimension (the runtime computes a min over each axis). Intent
   * is the user's declared limit; BrandKit is the host's hard ceiling. Most
   * commercial deployments configure both: a generous BrandKit cap that
   * catches runaway loops, plus tighter per-user intent budgets for free /
   * pro / enterprise tiers.
   *
   * See `mergeCompileBudgets` in `@cir/compiler` for the merge semantics.
   */
  compile_budget: CompileBudgetSchema.optional(),
});
export type BrandKit = z.infer<typeof BrandKitSchema>;
