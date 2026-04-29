// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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
 */

import { z } from 'zod';

const TokenScale = z.record(z.string(), z.string());

export const BrandTokensSchema = z.object({
  colors: TokenScale,
  spacing: TokenScale,
  typography: z.object({
    font_stack: z.string(),
    scale: TokenScale,
    weight: TokenScale.optional(),
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

export const BrandVoiceSchema = z.object({
  tone: z.string(),
  do: z.array(z.string()),
  dont: z.array(z.string()),
});
export type BrandVoice = z.infer<typeof BrandVoiceSchema>;

export const BrandKitSchema = z.object({
  /** Stable id; published at /.well-known/brand-kit.json. */
  id: z.string().min(1),
  /** Semver — bumping evicts manifests compiled against the prior version. */
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  tokens: BrandTokensSchema,
  variants: BrandVariantsSchema,
  voice: BrandVoiceSchema,
});
export type BrandKit = z.infer<typeof BrandKitSchema>;
