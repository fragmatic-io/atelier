// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Unit tests for `compileWorkflowViaLlm()`.
 *
 * We mock the underlying `CompilerService` via the `compilerOverride`
 * option so the test suite never touches a real LLM. The point is to
 * verify that the helper assembles a `CompileInput` with all four
 * load-bearing slots populated (capabilities / components / brand-kit /
 * intent) — drift here means the gate's screenshot baselines no longer
 * reflect what production hosts compile.
 */

import { describe, expect, it, vi } from 'vitest';
import type { CompileInput, CompilerService } from '@atelier/compiler';
import {
  buildCompileInputFromPersona,
  compileWorkflowViaLlm,
  getWorkflowPersona,
  WORKFLOW_PERSONA_NAMES,
} from '../../storybook/workflows/compile-via-llm.js';

function fakeCompiler(): {
  compiler: CompilerService;
  calls: CompileInput[];
} {
  const calls: CompileInput[] = [];
  const compile = vi.fn((input: CompileInput) => {
    calls.push(input);
    return Promise.resolve({
      manifest: {
        manifest_id: 'm_testfixture',
        user_id: input.user_id,
        app_id: input.app_id,
        compiled_from: {
          capability_version: '1.0.0',
          skill_versions: {},
          component_catalog_version: '1.0.0',
          intent_profile_version: 1,
          compiler_model: 'fake',
          compiled_at: '2026-05-03T00:00:00.000Z',
        },
        ttl: null,
        invalidates_on: [],
        policies_satisfied: [],
        routes: [
          {
            path: input.route,
            title: 'fixture',
            layout: { component: 'Container', children: [] },
          },
        ],
      },
      token_cost: 0,
      duration_ms: 1,
      model: 'fake',
      diff_mode: false,
    });
  });
  return {
    compiler: { id: 'fake', compile },
    calls,
  };
}

describe('compileWorkflowViaLlm', () => {
  for (const workflowName of WORKFLOW_PERSONA_NAMES) {
    it(`builds a CompileInput with capabilities + components + brand-kit + intent for "${workflowName}"`, async () => {
      const { compiler, calls } = fakeCompiler();
      const persona = getWorkflowPersona(workflowName);

      await compileWorkflowViaLlm(workflowName, { compilerOverride: compiler });

      expect(calls).toHaveLength(1);
      const input = calls[0]!;

      // Identity matches the persona.
      expect(input.user_id).toBe(persona.intent.user_id);
      expect(input.route).toBe(persona.route);
      expect(input.app_id).toMatch(/^atelier\.workflow\./);

      // Capabilities populated and pass-through-equal to the persona's set.
      expect(Object.keys(input.capabilities).sort()).toEqual(
        Object.keys(persona.capabilities).sort(),
      );

      // Components populated with one entry per persona-allow-listed id.
      expect(input.components.length).toBe(persona.components.length);
      const componentIds = (input.components as Array<{ id: string }>).map((c) => c.id).sort();
      expect(componentIds).toEqual([...persona.components].sort());

      // Brand kit threaded; the helper resolves the id to the concrete kit.
      expect(input.brandKit).toBeDefined();
      expect(input.brandKit?.id).toBe(persona.brand_kit_id);

      // Intent threaded: original rules + 2 layout-derived rules folded in.
      expect(input.intent).toBeDefined();
      expect(input.intent?.rules.length).toBe(persona.intent.rules.length + 2);
      expect(input.intent?.rules.map((r) => r.scope)).toContain('workflow');
      const workflowRules = (input.intent?.rules ?? []).filter((r) => r.scope === 'workflow');
      // One rule should encode the few-shot summary, one the layout constraints.
      expect(workflowRules.some((r) => r.rule.includes(persona.few_shot_summary))).toBe(true);
      expect(workflowRules.some((r) => r.rule.includes('Layout constraints'))).toBe(true);
    });
  }

  it('throws on an unknown workflow name', async () => {
    // The helper accepts any string at runtime and throws on unknown names;
    // the type system narrows to the literal union, so we cast through
    // `unknown` to construct the failing call.
    const unknownName = 'not-a-workflow' as unknown as (typeof WORKFLOW_PERSONA_NAMES)[number];
    await expect(compileWorkflowViaLlm(unknownName, { apiKey: 'unused' })).rejects.toThrow(
      /unknown workflow/,
    );
  });

  it('throws when no compiler override and no apiKey is provided', async () => {
    await expect(compileWorkflowViaLlm('approval-command-center', {})).rejects.toThrow(
      /apiKey is required/,
    );
  });

  it('inputDecorator runs after build and is forwarded to the compiler', async () => {
    const { compiler, calls } = fakeCompiler();
    const decorator = vi.fn(
      (input: CompileInput): CompileInput => ({
        ...input,
        app_id: 'overridden.app',
      }),
    );

    await compileWorkflowViaLlm('approval-command-center', {
      compilerOverride: compiler,
      inputDecorator: decorator,
    });

    expect(decorator).toHaveBeenCalledTimes(1);
    expect(calls[0]?.app_id).toBe('overridden.app');
  });

  it('buildCompileInputFromPersona is exported and stable for direct callers', () => {
    const persona = getWorkflowPersona('exception-review-workbench');
    const input = buildCompileInputFromPersona(persona);
    expect(input.route).toBe(persona.route);
    expect(input.capabilities['exception.resolve']).toBeDefined();
    expect(input.components.length).toBeGreaterThan(0);
  });
});
