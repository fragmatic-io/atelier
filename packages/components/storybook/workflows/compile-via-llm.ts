// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `compileWorkflowViaLlm()` — Sprint 2.3 helper.
 *
 * Takes a workflow persona fixture (the `IntentProfile` + capability set +
 * component allow-list + brand-kit reference seeded under
 * `./persona-fixtures/<name>.persona.json`) and runs it through a real
 * `GeminiCompiler` to produce a `Manifest`. The shape mirrors what production
 * hosts assemble in their compile pipeline — the only differences are:
 *   - we hard-code `user_id` / `app_id` / route from the fixture (no vault),
 *   - we mock the post-parse policy validator the same way the runtime does
 *     so a structurally-valid manifest with one stray policy violation does
 *     not bounce the whole compile.
 *
 * The duplication of "production compile shape" is intentional: this gate is
 * a contract over the LLM compile, not over the host wiring. If `GeminiCompiler`
 * starts requiring a new field on `CompileInput` to produce a healthy manifest,
 * the gate must update too — silent reuse via a shared helper would obscure
 * that signal.
 *
 * Usage:
 *
 *   import { compileWorkflowViaLlm } from './compile-via-llm.js';
 *   const manifest = await compileWorkflowViaLlm('approval-command-center', {
 *     apiKey: process.env.GEMINI_API_KEY!,
 *   });
 */

import type { Capability, ComponentDefinition, IntentProfile, Manifest } from '@atelier/schemas';
import {
  GeminiCompiler,
  createBaselineManifestValidator,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from '@atelier/compiler';
import { resolveAtelierBrandKit } from '../../src/brand/presets.js';

import approvalCommandCenter from './persona-fixtures/approval-command-center.persona.json' with { type: 'json' };
import customerContextPanel from './persona-fixtures/customer-context-panel.persona.json' with { type: 'json' };
import exceptionReviewWorkbench from './persona-fixtures/exception-review-workbench.persona.json' with { type: 'json' };

/**
 * Persona fixture shape. Loaded from the JSON files in
 * `persona-fixtures/`. Pinned per Sprint 2.3 so LLM stylistic drift does not
 * blow up the visual gate from one run to the next.
 */
export interface WorkflowPersonaFixture {
  readonly name: string;
  readonly route: string;
  readonly title: string;
  readonly intent: IntentProfile;
  readonly capabilities: Record<string, Capability>;
  /** Component ids the persona allow-lists. Resolved against the runtime catalog. */
  readonly components: readonly string[];
  readonly brand_kit_id: string;
  /** Free-form description the LLM consumes via `intent.rules`. */
  readonly few_shot_summary: string;
  /** Layout knobs (rows visible, modal yes/no, primary action) the persona pins. */
  readonly layout_constraints: Record<string, unknown>;
}

const WORKFLOW_PERSONAS: Readonly<Record<string, WorkflowPersonaFixture>> = Object.freeze({
  'approval-command-center': approvalCommandCenter as unknown as WorkflowPersonaFixture,
  'customer-context-panel': customerContextPanel as unknown as WorkflowPersonaFixture,
  'exception-review-workbench': exceptionReviewWorkbench as unknown as WorkflowPersonaFixture,
});

export type WorkflowPersonaName = keyof typeof WORKFLOW_PERSONAS;

export const WORKFLOW_PERSONA_NAMES = Object.freeze([
  'approval-command-center',
  'customer-context-panel',
  'exception-review-workbench',
] as const);

export interface CompileWorkflowOptions {
  /** Required for the live LLM path. Tests inject a `compilerOverride` instead. */
  apiKey?: string;
  /**
   * Optional override for the underlying compiler (used in unit tests). If
   * supplied, `apiKey` is ignored. The override is treated as opaque — we
   * call `compile(input)` and surface the result.
   */
  compilerOverride?: CompilerService;
  /**
   * Optional override of the `CompileInput` builder — exposed for unit tests
   * that want to inspect (or mutate) the shape without rebuilding it from
   * scratch. Production callers should leave this unset.
   */
  inputDecorator?: (input: CompileInput) => CompileInput;
}

/**
 * Build the `CompileInput` we send to `GeminiCompiler` from a persona
 * fixture. Exported so tests can assert the shape (capabilities populated /
 * brand-kit threaded / intent + components fanned out) without round-tripping
 * a live LLM call.
 */
export function buildCompileInputFromPersona(persona: WorkflowPersonaFixture): CompileInput {
  const components: (ComponentDefinition & { id: string })[] = persona.components.map((id) => ({
    id,
    props_schema: `${id}Props`,
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@atelier/components/baseline@0.5.0',
    examples: [],
    text_render: true,
    description:
      // The LLM reads `description` to pick components. Keep it terse but
      // truthful so it understands what each baseline primitive is for.
      `Baseline ${id} primitive from @atelier/components. ` +
      `Use in compositions matching the persona's layout_constraints.`,
  }));

  const brandKit = resolveAtelierBrandKit(persona.brand_kit_id);

  // Fold the `few_shot_summary` and `layout_constraints` into the intent's
  // free-form rules so the LLM honours them — these are the dominant signal
  // that keeps the compiled output shape stable across runs.
  const intentWithLayout: IntentProfile = {
    ...persona.intent,
    rules: [
      ...persona.intent.rules,
      {
        scope: 'workflow',
        rule: `Layout summary: ${persona.few_shot_summary}`,
        version: 1,
        locked: true,
      },
      {
        scope: 'workflow',
        rule: `Layout constraints (JSON): ${JSON.stringify(persona.layout_constraints)}`,
        version: 1,
        locked: true,
      },
    ],
  };

  return {
    user_id: persona.intent.user_id,
    app_id: 'atelier.workflow.compiled-visual-gate',
    route: persona.route,
    capabilities: persona.capabilities,
    components,
    intent: intentWithLayout,
    brandKit,
  };
}

/**
 * Compile the named workflow persona via real Gemini and return the produced
 * manifest. Throws on validation failure — the caller (`compiled-workflows.playwright.ts`)
 * surfaces that as a test failure.
 */
export async function compileWorkflowViaLlm(
  workflowName: WorkflowPersonaName,
  opts: CompileWorkflowOptions,
): Promise<Manifest> {
  const persona = WORKFLOW_PERSONAS[workflowName];
  if (!persona) {
    throw new Error(
      `compileWorkflowViaLlm: unknown workflow "${workflowName}". ` +
        `Known: ${Object.keys(WORKFLOW_PERSONAS).join(', ')}`,
    );
  }

  let input = buildCompileInputFromPersona(persona);
  if (opts.inputDecorator) input = opts.inputDecorator(input);

  // Mirror the production wiring: a baseline policy validator threaded into
  // the compiler so semantic violations cause a single bounded retry rather
  // than propagating into the rendered manifest. We pass an empty
  // `grantedFields` set — the persona's capabilities already lean on
  // synthetic data, so PII fields never come into play here.
  const validate = createBaselineManifestValidator({ grantedFields: [] as readonly string[] });

  const compiler =
    opts.compilerOverride ??
    new GeminiCompiler({
      apiKey: requireApiKey(opts.apiKey),
      // Wrap the validator so the compiler sees only the `errors[]` shape
      // it expects (the validator returns the full `ManifestValidationResult`).
      // The baseline validator is synchronous, so we narrow the union here.
      validate: (manifest) => {
        const result = validate(manifest, input) as { ok: boolean; reasons?: readonly string[] };
        return { errors: result.ok ? [] : (result.reasons ?? []) };
      },
    });

  const compiled: CompileResult = await compiler.compile(input);
  return compiled.manifest;
}

function requireApiKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw new Error(
      'compileWorkflowViaLlm: opts.apiKey is required (set GEMINI_API_KEY for the visual gate).',
    );
  }
  return apiKey;
}

/** Lookup helper exposed for tests + the Playwright runner. */
export function getWorkflowPersona(name: WorkflowPersonaName): WorkflowPersonaFixture {
  const persona = WORKFLOW_PERSONAS[name];
  if (!persona) {
    throw new Error(`getWorkflowPersona: unknown workflow "${name}"`);
  }
  return persona;
}
