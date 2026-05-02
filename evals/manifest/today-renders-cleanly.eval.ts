// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * Manifest eval: the demo's `/today` manifest layout is structurally valid.
 *
 * `todayManifest()` is hand-written (the LLM-backed compiler ships in
 * Phase 5) so the layout shape — the part the runtime actually renders —
 * must remain a valid example of `RouteSchema`. We assert against
 * `RouteSchema` rather than the full `ManifestSchema` because the demo's
 * `manifest_id` (`m_demo_today`) deliberately violates the production
 * `^m_[a-z0-9]{8,}$` format for human-friendly debugging; that's a known
 * Phase 5b deferral, not a layout regression.
 */

import { defineEval } from '@atelier/evals';
import { RouteSchema } from '@atelier/schemas';
import { todayManifest } from '../../apps/demo/lib/fake-manifests';

export default defineEval({
  id: 'manifest/today/renders-cleanly',
  description: 'Every /today route validates structurally against RouteSchema.',
  kind: 'manifest',
  tags: ['today', 'schema'],
  input: null,
  run: () => {
    const manifest = todayManifest();
    const errors: string[] = [];
    for (const route of manifest.routes) {
      const parsed = RouteSchema.safeParse(route);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(`${route.path} ${issue.path.join('.')}: ${issue.message}`);
        }
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      route_count: manifest.routes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as { ok: boolean; errors: string[]; route_count: number };
    return o.ok === true && o.errors.length === 0 && o.route_count > 0;
  },
});
