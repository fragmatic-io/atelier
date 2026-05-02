// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Vitest unit tests for the personalisation-chain eval.
 *
 * The eval is driven by the `atelier-evals` runner; this file pins the per-step
 * assertions under vitest so a regression breaks CI immediately. The
 * synthesizer hook in `ChainDeps.synthesize` is the primary surface — it
 * lets us deliberately drop a single intent signal and assert that
 * exactly that signal flips to `false` in the outcome (rather than
 * collapsing the whole chain).
 */

import { describe, expect, it } from 'vitest';
import chainEval, {
  runPersonalisationChain,
  synthesizePersonalisedManifest,
  type ChainDeps,
  type PersonalisationChainOutcome,
} from './personalisation-chain.eval.js';
import type { Manifest } from '@atelier/schemas';

/** Convenience wrapper: forces the offline path (no Gemini key). */
async function runOffline(
  deps: Parameters<typeof runPersonalisationChain>[1] = {},
): Promise<PersonalisationChainOutcome> {
  return runPersonalisationChain(
    { fixture: 'personalisation-chain' },
    { envKeyResolver: () => undefined, ...deps },
  );
}

describe('personalisation-chain eval — registration', () => {
  it('is registered as an end-to-end eval with the chain tag', () => {
    expect(chainEval.id).toBe('end-to-end/personalisation-chain');
    expect(chainEval.kind).toBe('end-to-end');
    expect(chainEval.tags).toContain('chain');
    expect(chainEval.tags).toContain('smoke');
    expect(chainEval.tags).toContain('integration');
    expect(chainEval.tags).toContain('gemini-optional');
  });
});

describe('personalisation-chain eval — happy path (offline)', () => {
  it('runs the full chain and returns the expected outcome shape', async () => {
    const outcome = await runOffline();
    // Shape assertions: every boolean defined, structurally complete.
    expect(typeof outcome.skipped).toBe('boolean');
    expect(typeof outcome.manifest_validates).toBe('boolean');
    expect(typeof outcome.policies_passed).toBe('number');
    expect(Array.isArray(outcome.policy_violations)).toBe(true);
    expect(outcome.intent_signals_propagated).toEqual({
      density: true,
      color_mode: true,
      motion: true,
      automation_trust: true,
    });
    expect(outcome.render_dom_correct).toEqual({
      density_attr: true,
      color_mode_attr: true,
      no_motion: true,
    });
    expect(outcome.engagement_pattern_detected).toBe(true);
    expect(outcome.audit_chain_complete).toBe(true);
    expect(outcome.refinement_applied).toBe(true);
  });

  it('predicate accepts the offline happy-path outcome', async () => {
    const outcome = await runOffline();
    const predicate = chainEval.expected as (out: unknown) => boolean;
    expect(predicate(outcome)).toBe(true);
  });

  it('reports skipped: false when no Gemini key is set', async () => {
    const outcome = await runOffline();
    expect(outcome.skipped).toBe(false);
    expect(outcome.compiler_model).toBeDefined();
    // The fallback's id is the canonical witness that the offline path
    // produced the manifest. Gemini-prefixed compiler ids would also be OK,
    // but offline guarantees the fallback's id.
    expect(outcome.compiler_model).toBe('fallback-personalised');
  });
});

describe('personalisation-chain eval — per-step failure isolation', () => {
  /**
   * A synthesizer wrapper: produces the canonical manifest and then mutates
   * it. Used to break exactly one step at a time.
   */
  function brokenSynth(mutate: (m: Manifest) => Manifest): NonNullable<ChainDeps['synthesize']> {
    return (input, opts) => {
      const manifest = synthesizePersonalisedManifest(input, opts);
      return mutate(manifest);
    };
  }

  it('flips intent_signals_propagated.density to false when the synthesizer drops density', async () => {
    const outcome = await runOffline({
      synthesize: brokenSynth((m) => {
        const layout = m.routes[0]?.layout;
        if (!layout) return m;
        const props = { ...(layout.props ?? {}) };
        delete props['density'];
        layout.props = props;
        // Also remove from the List child to guarantee no fallback.
        for (const c of layout.children ?? []) {
          if (c.component === 'List') {
            const cp = { ...(c.props ?? {}) };
            delete cp['density'];
            c.props = cp;
          }
        }
        return m;
      }),
    });
    expect(outcome.intent_signals_propagated.density).toBe(false);
    // Other signals stay true — the failure is isolated.
    expect(outcome.intent_signals_propagated.color_mode).toBe(true);
    expect(outcome.intent_signals_propagated.motion).toBe(true);
  });

  it('flips render_dom_correct.color_mode_attr to false when color_mode is dropped', async () => {
    const outcome = await runOffline({
      synthesize: brokenSynth((m) => {
        const layout = m.routes[0]?.layout;
        if (!layout) return m;
        const props = { ...(layout.props ?? {}) };
        delete props['data-color-mode'];
        layout.props = props;
        return m;
      }),
    });
    expect(outcome.render_dom_correct.color_mode_attr).toBe(false);
    expect(outcome.render_dom_correct.density_attr).toBe(true);
  });

  it('flips intent_signals_propagated.motion to false when an animation prop leaks in', async () => {
    const outcome = await runOffline({
      synthesize: brokenSynth((m) => {
        const layout = m.routes[0]?.layout;
        if (!layout) return m;
        layout.props = { ...(layout.props ?? {}), animation: 'fade-in' };
        return m;
      }),
    });
    expect(outcome.intent_signals_propagated.motion).toBe(false);
    expect(outcome.render_dom_correct.no_motion).toBe(false);
  });

  it('flips intent_signals_propagated.automation_trust to false when an inline button slips through', async () => {
    const outcome = await runOffline({
      synthesize: brokenSynth((m) => {
        const layout = m.routes[0]?.layout;
        if (!layout) return m;
        for (const c of layout.children ?? []) {
          if (c.component === 'Stack') {
            for (const btn of c.children ?? []) {
              if (btn.component === 'Button') {
                btn.props = { ...(btn.props ?? {}), confirmation: 'inline' };
              }
            }
          }
        }
        return m;
      }),
    });
    expect(outcome.intent_signals_propagated.automation_trust).toBe(false);
  });

  it('flips refinement_applied to false when the synthesizer ignores the engagement hint', async () => {
    // Replace the synthesizer with one that always orders actions
    // alphabetically, ignoring the engagement hint.
    const outcome = await runOffline({
      synthesize: (input, opts) => {
        return synthesizePersonalisedManifest(input, {
          // Strip the engagement field — synthesize as if no hint.
          manifestIdSuffix: opts.manifestIdSuffix,
        });
      },
    });
    expect(outcome.refinement_applied).toBe(false);
    // The first compile still validates and propagates intent — the only
    // step that breaks is the engagement → refinement closure.
    expect(outcome.intent_signals_propagated.density).toBe(true);
    expect(outcome.engagement_pattern_detected).toBe(true);
  });
});

describe('personalisation-chain eval — Gemini gating', () => {
  it('skips the Gemini head when no key is set but completes the chain', async () => {
    const outcome = await runPersonalisationChain(
      { fixture: 'personalisation-chain' },
      { envKeyResolver: () => undefined },
    );
    // Offline: the only compiler in the composite is the fallback. Its
    // model id is `fallback-personalised`. Gemini-prefixed model would
    // mean the head ran.
    expect(outcome.compiler_model).toBe('fallback-personalised');
    expect(outcome.refined_compiler_model).toBe('fallback-personalised');
    // Despite no Gemini, every chain step still passes.
    const predicate = chainEval.expected as (out: unknown) => boolean;
    expect(predicate(outcome)).toBe(true);
  });

  it('skips the Gemini head when the env value is a placeholder', async () => {
    const outcome = await runPersonalisationChain(
      { fixture: 'personalisation-chain' },
      { envKeyResolver: () => 'placeholder' },
    );
    expect(outcome.compiler_model).toBe('fallback-personalised');
  });
});

describe('personalisation-chain eval — predicate', () => {
  it('rejects an outcome with policies_passed below the baseline count', () => {
    const predicate = chainEval.expected as (out: unknown) => boolean;
    const partial: PersonalisationChainOutcome = {
      skipped: false,
      manifest_validates: true,
      policies_passed: 0,
      policy_violations: [],
      intent_signals_propagated: {
        density: true,
        color_mode: true,
        motion: true,
        automation_trust: true,
      },
      render_dom_correct: { density_attr: true, color_mode_attr: true, no_motion: true },
      engagement_pattern_detected: true,
      audit_chain_complete: true,
      refinement_applied: true,
    };
    expect(predicate(partial)).toBe(false);
  });

  it('rejects a skipped outcome (the chain is offline-first; skip is never legitimate)', () => {
    const predicate = chainEval.expected as (out: unknown) => boolean;
    expect(predicate({ skipped: true, reason: 'no GEMINI_API_KEY' })).toBe(false);
  });
});
