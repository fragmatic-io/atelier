// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `respects_brand_kit` — design-system enforcement.
 *
 * When the policy context carries a `brand_kit`, this policy walks every
 * `LayoutNode` in the manifest and emits violations for:
 *
 *   1. Component prop values that aren't in the brand kit's variant whitelist.
 *      e.g. `Button.variant: 'crimson'` when the kit declares
 *      `Button: ['primary','secondary','destructive','ghost']`.
 *
 *   2. Inline `style` props or props with raw color / pixel values that
 *      should reference tokens instead. We catch the obvious cases:
 *      `#rrggbb`, `#rgb`, `rgb(…)`, `rgba(…)`, and unitful pixel values
 *      (`12px`). We DO NOT block CSS keywords like `red` — too lenient,
 *      but a brand kit can opt to add them.
 *
 *   3. Wave 6 (P-6) extensions. Each is opt-in: a check fires only when the
 *      brand kit declares the relevant scale AND the manifest carries an
 *      inline value the check is interested in.
 *
 *      - `border-radius` / `borderRadius` props (or `radius` keys nested in
 *        `style`) must match a value in `radius_scale`.
 *      - `box-shadow` / `boxShadow` props (or `shadow` keys nested in
 *        `style`) must match a value in `shadow_scale`.
 *      - `transition-duration` / `transitionDuration` / `animationDuration`
 *        / `duration` props must match a value in `motion.duration_scale`
 *        (parsed as a millisecond integer).
 *      - When `accessibility.contrast_minimum` is set and a node carries
 *        BOTH a foreground colour AND a background colour as raw hex
 *        strings, the policy computes the WCAG contrast ratio inline; below
 *        the minimum we warn (severity `warn` for this single check — a
 *        designer might intentionally use low-contrast decorative copy).
 *
 * Severity: `error` for the variant + raw-value + scale checks. The contrast
 * check emits `warn` violations, since it's heuristic-driven (only fires on
 * inline raw colors; tokens are presumed audited at the kit level).
 *
 * When the policy context has no `brand_kit`, this policy is a no-op
 * (returns ok). That keeps existing apps working until they author one.
 */

import type { BrandKit } from '@cir/schemas';

import type { NamedPolicy, PolicyViolation } from '../result.js';
import { walkManifest, escapeJsonPointerSegment } from '../internal/walk-layout.js';

const HEX_RE = /#[0-9a-fA-F]{3,8}/;
const RGB_RE = /\brgba?\s*\(/i;
const PX_RE = /\b\d+(?:\.\d+)?px\b/i;

function looksRaw(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return HEX_RE.test(value) || RGB_RE.test(value) || PX_RE.test(value);
}

// -----------------------------------------------------------------------------
// Inline-prop key matchers. The compiler authors props in either CSS form
// (`border-radius`) or React form (`borderRadius`). We accept both. Bare keys
// like `radius`/`shadow` are also matched when they appear directly on props.
// -----------------------------------------------------------------------------

function isRadiusKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'border-radius' || k === 'borderradius' || k === 'radius';
}

function isShadowKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'box-shadow' || k === 'boxshadow' || k === 'shadow';
}

function isDurationKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === 'transition-duration' ||
    k === 'transitionduration' ||
    k === 'animation-duration' ||
    k === 'animationduration' ||
    k === 'duration'
  );
}

/**
 * Parse a duration string ("200ms", "0.2s", "200") into integer ms. Returns
 * `null` for unrecognized shapes (e.g. `'fast'`, `'cubic-bezier(...)'`).
 * Numbers are accepted as-is (assumed ms).
 */
function parseDurationMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const msMatch = /^(-?\d+(?:\.\d+)?)\s*ms$/i.exec(trimmed);
  if (msMatch && msMatch[1] !== undefined) return Math.round(Number(msMatch[1]));
  const sMatch = /^(-?\d+(?:\.\d+)?)\s*s$/i.exec(trimmed);
  if (sMatch && sMatch[1] !== undefined) return Math.round(Number(sMatch[1]) * 1000);
  const intMatch = /^-?\d+$/.exec(trimmed);
  if (intMatch) return Number(trimmed);
  return null;
}

// -----------------------------------------------------------------------------
// Inline contrast check. WCAG relative luminance formula, hex-only inputs.
//
// We deliberately implement this in-line (no `culori`/`color-contrast` deps)
// because the only inputs we accept are short and long hex strings, which are
// trivial to parse. Anything else (named CSS colour, hsl(), token reference)
// is skipped — those are the design system's job to vet.
// -----------------------------------------------------------------------------

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa`. Returns null if it doesn't match. */
function parseHex(value: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]+)$/.exec(value.trim());
  if (!m || !m[1]) return null;
  const hex = m[1];
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0]! + hex[0]!, 16);
    const g = Number.parseInt(hex[1]! + hex[1]!, 16);
    const b = Number.parseInt(hex[2]! + hex[2]!, 16);
    return { r, g, b };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

/** Channel-wise sRGB gamma decoding per WCAG. */
function channelLuminance(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** WCAG contrast ratio between two hex colours. Returns null if either is bad. */
export function hexContrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Property-name candidates we treat as foreground/background colours when
 * looking for an inline contrast pair. We pick conservatively — only props
 * we can be reasonably certain refer to surface text vs. surface fill.
 */
const FG_KEYS = new Set(['color', 'fg', 'foreground', 'textcolor']);
const BG_KEYS = new Set(['background', 'background-color', 'backgroundcolor', 'bg']);

function findColorPair(
  props: Record<string, unknown>,
): { fg: string; fgKey: string; bg: string; bgKey: string } | null {
  let fg: { value: string; key: string } | null = null;
  let bg: { value: string; key: string } | null = null;
  for (const [k, v] of Object.entries(props)) {
    if (typeof v !== 'string') continue;
    const lower = k.toLowerCase();
    if (!fg && FG_KEYS.has(lower) && HEX_RE.test(v)) fg = { value: v, key: k };
    if (!bg && BG_KEYS.has(lower) && HEX_RE.test(v)) bg = { value: v, key: k };
  }
  if (fg && bg) return { fg: fg.value, fgKey: fg.key, bg: bg.value, bgKey: bg.key };
  return null;
}

// -----------------------------------------------------------------------------
// The policy itself.
// -----------------------------------------------------------------------------

interface ScaleCheck {
  /** Allowed values (CSS strings). When absent, the check is skipped. */
  allowed: ReadonlySet<string> | null;
  /** Human label for the violation message. */
  label: string;
  /** Brand-kit field path the author should cross-reference. */
  hintField: string;
}

function buildScaleCheck(
  values: Record<string, string> | undefined,
  label: string,
  hintField: string,
): ScaleCheck {
  if (!values) return { allowed: null, label, hintField };
  return {
    allowed: new Set(Object.values(values).map((v) => v.trim())),
    label,
    hintField,
  };
}

function buildDurationCheck(kit: BrandKit): ReadonlySet<number> | null {
  const scale = kit.motion?.duration_scale;
  if (!scale) return null;
  return new Set(Object.values(scale).map((n) => Math.round(n)));
}

export const respectsBrandKit: NamedPolicy = {
  id: 'respects_brand_kit',
  description:
    'Component props must use brand-kit variants; raw colors / pixel values are forbidden in layouts. Wave 6: also enforces radius / shadow / motion scales and a contrast-minimum heuristic.',
  applies_to: 'manifest',
  severity: 'error',
  evaluate(ctx) {
    const violations: PolicyViolation[] = [];
    const kit = ctx.brand_kit;
    if (!kit) return { ok: true, violations };

    const radiusCheck = buildScaleCheck(kit.radius_scale, 'radius', 'radius_scale');
    const shadowCheck = buildScaleCheck(kit.shadow_scale, 'shadow', 'shadow_scale');
    const durationAllowed = buildDurationCheck(kit);
    const contrastMin = kit.accessibility?.contrast_minimum;

    walkManifest(ctx.manifest, (node, path) => {
      const props = node.props;
      if (!props || typeof props !== 'object') return;

      const allowed = kit.variants[node.component];

      for (const [propName, value] of Object.entries(props)) {
        const propPath = `${path}/props/${escapeJsonPointerSegment(propName)}`;

        // Variant enum check: any prop named exactly "variant" must be in
        // the per-component whitelist when one exists.
        if (allowed && propName === 'variant' && typeof value === 'string') {
          if (!allowed.includes(value)) {
            violations.push({
              policy_id: 'respects_brand_kit',
              severity: 'error',
              message: `Component "${node.component}" prop variant="${value}" is not in the brand kit's allowed variants [${allowed.join(', ')}].`,
              path: propPath,
              hint: 'Use one of the allowed variant values, or extend the brand kit.',
            });
          }
        }

        // Raw color / px detection — applies to every prop, including
        // nested style strings like `style: 'color: #ff0000'`.
        if (looksRaw(value)) {
          violations.push({
            policy_id: 'respects_brand_kit',
            severity: 'error',
            message: `Component "${node.component}" prop "${propName}" contains a raw style value (${String(value)}). Reference brand-kit tokens instead.`,
            path: propPath,
            hint: 'Replace with a token reference (e.g. token:colors.primary, token:spacing.md).',
          });
        }

        // ------------------------------------------------------------------
        // Wave 6: scale enforcement. Each check skips silently when the kit
        // does not declare the corresponding scale, OR when the prop value
        // is a token reference (`token:radius.md`) rather than an inline
        // CSS string. Token references are presumed audited at the kit level.
        // ------------------------------------------------------------------

        if (
          radiusCheck.allowed &&
          isRadiusKey(propName) &&
          typeof value === 'string' &&
          !value.startsWith('token:')
        ) {
          const trimmed = value.trim();
          if (!radiusCheck.allowed.has(trimmed)) {
            violations.push({
              policy_id: 'respects_brand_kit',
              severity: 'error',
              message: `Component "${node.component}" prop "${propName}"="${value}" is not in the brand kit's radius_scale.`,
              path: propPath,
              hint: `Use a value from radius_scale (${[...radiusCheck.allowed].join(', ')}) or a token reference.`,
            });
          }
        }

        if (
          shadowCheck.allowed &&
          isShadowKey(propName) &&
          typeof value === 'string' &&
          !value.startsWith('token:')
        ) {
          const trimmed = value.trim();
          if (!shadowCheck.allowed.has(trimmed)) {
            violations.push({
              policy_id: 'respects_brand_kit',
              severity: 'error',
              message: `Component "${node.component}" prop "${propName}" is not in the brand kit's shadow_scale.`,
              path: propPath,
              hint: 'Use a shadow value declared in shadow_scale or a token reference.',
            });
          }
        }

        if (durationAllowed && isDurationKey(propName)) {
          if (typeof value === 'string' && value.startsWith('token:')) {
            // token reference — presumed audited
          } else {
            const ms = parseDurationMs(value);
            if (ms === null || !durationAllowed.has(ms)) {
              violations.push({
                policy_id: 'respects_brand_kit',
                severity: 'error',
                message: `Component "${node.component}" prop "${propName}"="${String(value)}" is not in the brand kit's motion.duration_scale.`,
                path: propPath,
                hint: `Use a duration from motion.duration_scale (${[...durationAllowed].join(', ')} ms) or a token reference.`,
              });
            }
          }
        }
      }

      // Inline contrast heuristic — only fires when both fg+bg are inline
      // hex AND the kit declares a contrast minimum. Token-driven colours
      // skip this check (they're vetted at the kit level).
      if (typeof contrastMin === 'number') {
        const pair = findColorPair(props);
        if (pair) {
          const ratio = hexContrastRatio(pair.fg, pair.bg);
          if (ratio !== null && ratio < contrastMin) {
            violations.push({
              policy_id: 'respects_brand_kit',
              severity: 'warn',
              message: `Component "${node.component}" inline colour pair (${pair.fgKey}=${pair.fg} on ${pair.bgKey}=${pair.bg}) has contrast ratio ${ratio.toFixed(2)}, below the brand kit's minimum (${contrastMin}).`,
              path: `${path}/props`,
              hint: 'Use brand-kit tokens for surface text/background pairs, which are pre-audited for contrast.',
            });
          }
        }
      }
    });

    return { ok: !violations.some((v) => v.severity === 'error'), violations };
  },
};
