// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `genericFallbackManifest` / `GenericFallbackCompiler` — the framework's
 * built-in last-resort fallback.
 *
 * When Gemini fails (network blip, rate limit, validation cascade) and the
 * host hasn't shipped a per-route fallback, the resolver still needs to
 * return SOMETHING — either a usable degraded manifest or a clear "we
 * couldn't compile" surface. This module provides both:
 *
 *   - `genericFallbackManifest(input)` — a small synthesizer that emits a
 *     minimal valid manifest with the requested route, a single `<Stack>`
 *     wrapping a `<Markdown>` heading + a `<Markdown>` body that names the
 *     route, and an `<Alert severity="info">` explaining the framework
 *     served the fallback. The shape is deliberately humble: just enough
 *     to render legibly without faking content the host didn't author.
 *
 *   - `GenericFallbackCompiler` — a `CompilerService` wrapping
 *     `genericFallbackManifest` so hosts can drop it into a
 *     `CompositeCompiler` chain without writing their own
 *     `manifestForRoute` function.
 *
 * Per `docs/ethos.md`:
 *   - Principle #1 (dynamic over static): hosts should rely on the LLM,
 *     not author static manifests. This compiler exists to keep them
 *     honest — when the LLM is unavailable, the framework returns a
 *     framework-shaped degradation, not a silent host-shaped one.
 *   - Principle #5 (visible compilation): the audit event for this
 *     compiler carries `compiler_model: 'fallback-generic'` so
 *     `<CompileBadge>` renders `⚪ fallback · 0 tok` distinctively.
 */

import type { Manifest } from '@cir/schemas';
import {
  CompilerOutputError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';

const FALLBACK_MODEL_ID = 'fallback-generic';

/**
 * Synthesize a humble, on-the-fly manifest for the requested route.
 * Shape: outer `<Stack>` containing a heading, a subtitle naming the
 * route, and an info-severity `<Alert>` that explains the LLM didn't
 * produce a result and the host didn't author a per-route fallback.
 *
 * Every demo's runtime resolver will validate this through whatever
 * policy stack the host wired. The output is intentionally small and
 * structurally correct (no empty containers, no missing required slots)
 * so it passes baseline composition rules out of the box.
 */
export function genericFallbackManifest(input: CompileInput): Manifest {
  const id = generateManifestId();
  return {
    manifest_id: id,
    user_id: input.user_id,
    app_id: input.app_id,
    compiled_from: {
      capability_version: '0.1.0',
      skill_versions: {},
      component_catalog_version: '0.1.0',
      intent_profile_version: 0,
      compiler_model: FALLBACK_MODEL_ID,
      compiled_at: new Date().toISOString(),
    },
    ttl: null,
    invalidates_on: [],
    routes: [
      {
        path: input.route,
        title: humanizeRoute(input.route),
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'md' },
          children: [
            {
              component: 'Markdown',
              props: { content: `# ${humanizeRoute(input.route)}` },
              children: [],
            },
            {
              component: 'Markdown',
              props: {
                content:
                  'The framework returned this route while the LLM compiler is unavailable. ' +
                  'Set `GEMINI_API_KEY` or check the resolver logs for compile failures.',
              },
              children: [],
            },
            {
              component: 'Alert',
              props: {
                severity: 'info',
                title: 'Generic fallback served',
                body: `Route \`${input.route}\` rendered via the framework's generic fallback (no per-host manifest authored, no LLM compile available).`,
              },
              children: [],
            },
          ],
        },
        refresh: {
          data: 'on_focus',
          structure: 'never_unless_invalidated',
        },
      },
    ],
    policies_satisfied: [],
  };
}

/**
 * `CompilerService` wrapping `genericFallbackManifest`. Drop into the tail
 * of a `CompositeCompiler` chain so the resolver always has SOMETHING to
 * return when the primary (LLM) compiler fails.
 */
export class GenericFallbackCompiler implements CompilerService {
  readonly id = FALLBACK_MODEL_ID;

  // eslint-disable-next-line @typescript-eslint/require-await
  async compile(input: CompileInput): Promise<CompileResult> {
    const startedAt = Date.now();
    const manifest = genericFallbackManifest(input);
    if (!manifest.routes[0]) {
      // Defense in depth — the synthesizer always returns at least one route.
      throw new CompilerOutputError(
        'GenericFallbackCompiler synthesized an empty manifest',
        manifest,
      );
    }
    return {
      manifest,
      token_cost: 0,
      duration_ms: Date.now() - startedAt,
      model: FALLBACK_MODEL_ID,
      diff_mode: false,
      reasoning: 'served by GenericFallbackCompiler — LLM unavailable, no per-host fallback.',
    };
  }
}

function humanizeRoute(route: string): string {
  const stripped = route.replace(/^\/+|\/+$/g, '');
  if (stripped.length === 0) return 'Home';
  const last = stripped.split('/').filter(Boolean).pop() ?? stripped;
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/[-_]/g, ' ');
}

function generateManifestId(): string {
  const ts = Date.now().toString(36).slice(-8);
  const rnd = Math.floor(Math.random() * 0xfffff)
    .toString(36)
    .padStart(4, '0');
  return `m_${ts}${rnd}`;
}
