// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Policy: `no_pii_in_query_strings`
 *
 * For every route, assert no PII field name appears as a path placeholder
 * (`/u/:email`) or as a literal segment that would obviously embed PII
 * (`/users/email/...`).
 *
 * Source spec: `/Users/vid/cir/docs/architecture.md` §"Policy engine":
 *
 *     for each route in manifest:
 *       assert route.path does not contain user PII fields
 *
 * The check looks at:
 *  1. `:placeholder` tokens — `/u/:email` flags `email`.
 *  2. Bare path segments — `/users/email/edit` flags `email`.
 *
 * `pii_fields` is supplied by the compiler from the per-app/tenant config.
 */

import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';

const POLICY_ID = 'no_pii_in_query_strings';

const PLACEHOLDER_RE = /:([a-zA-Z_][\w-]*)/g;

function tokensInPath(path: string): { placeholders: string[]; segments: string[] } {
  const placeholders: string[] = [];
  for (const match of path.matchAll(PLACEHOLDER_RE)) {
    if (match[1]) placeholders.push(match[1]);
  }
  const segments = path
    .split('/')
    .map((s) => s.trim())
    // Strip any `:placeholder` prefix from segments before recording — we
    // already captured the placeholder name above; the literal-segment
    // pass should NOT double-count.
    .filter((s) => s.length > 0 && !s.startsWith(':'));
  return { placeholders, segments };
}

export const noPiiInQueryStrings: NamedPolicy = {
  id: POLICY_ID,
  description:
    'No route path embeds a PII field as a placeholder or literal segment (PII belongs in the body, not the URL).',
  applies_to: 'manifest',
  severity: 'error',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];
    const pii = ctx.pii_fields;
    if (pii.size === 0) {
      return { ok: true, violations };
    }

    ctx.manifest.routes.forEach((route, idx) => {
      const { placeholders, segments } = tokensInPath(route.path);
      for (const ph of placeholders) {
        if (pii.has(ph)) {
          violations.push({
            policy_id: POLICY_ID,
            severity: 'error',
            message: `Route path "${route.path}" contains PII placeholder ":${ph}".`,
            path: `/routes/${idx}/path`,
            hint: 'Move PII into the request body or a per-user opaque token; do not encode it in URLs.',
          });
        }
      }
      for (const seg of segments) {
        if (pii.has(seg)) {
          violations.push({
            policy_id: POLICY_ID,
            severity: 'error',
            message: `Route path "${route.path}" contains PII literal segment "${seg}".`,
            path: `/routes/${idx}/path`,
            hint: 'Rename the segment or move PII out of the URL surface.',
          });
        }
      }
    });

    return {
      ok: violations.length === 0,
      violations,
    };
  },
};
