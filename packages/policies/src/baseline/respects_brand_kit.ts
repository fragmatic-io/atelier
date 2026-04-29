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
 * Severity: `error`. Off-brand UI is a contract violation. The compiler
 * retries with the violation reason injected; a stubborn LLM that won't
 * comply gets dropped to fallback.
 *
 * When the policy context has no `brand_kit`, this policy is a no-op
 * (returns ok). That keeps existing apps working until they author one.
 */

import type { NamedPolicy, PolicyViolation } from '../result.js';
import { walkManifest, escapeJsonPointerSegment } from '../internal/walk-layout.js';

const HEX_RE = /#[0-9a-fA-F]{3,8}/;
const RGB_RE = /\brgba?\s*\(/i;
const PX_RE = /\b\d+(?:\.\d+)?px\b/i;

function looksRaw(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return HEX_RE.test(value) || RGB_RE.test(value) || PX_RE.test(value);
}

export const respectsBrandKit: NamedPolicy = {
  id: 'respects_brand_kit',
  description:
    'Component props must use brand-kit variants; raw colors / pixel values are forbidden in layouts.',
  applies_to: 'manifest',
  severity: 'error',
  evaluate(ctx) {
    const violations: PolicyViolation[] = [];
    const kit = ctx.brand_kit;
    if (!kit) return { ok: true, violations };

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
      }
    });

    return { ok: violations.length === 0, violations };
  },
};
