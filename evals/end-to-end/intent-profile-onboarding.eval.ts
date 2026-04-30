// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * End-to-end smoke eval: real Gemini → real `IntentProfile` draft.
 *
 * Skips gracefully when `GEMINI_API_KEY` is unset or obviously a placeholder,
 * so CI without the secret stays green. When the key is set, this exercises
 * `GeminiIntentProfileCompiler` end-to-end with a fixture description and
 * asserts that the returned profile validates and contains the expected
 * lenses / preferences.
 *
 * Mirrors `gemini-smoke.eval.ts`: same `SmokeDeps` DI seam, same
 * skip-when-no-key gating, same auth-failed branch with `redactApiKey`.
 */
import { defineEval } from '@cir/evals';
import {
  CompositeIntentProfileCompiler,
  FallbackIntentProfileCompiler,
  GeminiIntentProfileCompiler,
  type IntentProfileCompilerService,
} from '@cir/compiler';
import { IntentProfileSchema, type IntentProfile } from '@cir/schemas';
import { hasRealGeminiKey, isAuthShapedError, redactApiKey } from './gemini-smoke.eval.js';

interface OnboardingOutcome {
  skipped: boolean;
  reason?: string;
  /**
   * Same auth_failed semantics as `gemini-smoke.eval.ts`: `true` means a key
   * was configured but the provider rejected it; `null` on the happy path so
   * the field is always present. Distinct from `skipped: true` ("no key was
   * configured at all").
   */
  auth_failed?: boolean | null;
  error_message?: string;
  compiler_model?: string;
  has_github_lens?: boolean;
  density?: string;
  automation_trust?: string;
  rule_count?: number;
  profile_valid?: boolean;
}

export interface OnboardingDeps {
  envKeyResolver?: () => string | undefined;
  /** Override the compiler. Tests inject a stub; production builds the real one. */
  compilerFactory?: (apiKey: string) => IntentProfileCompilerService;
}

interface OnboardingInput {
  description: string;
  user_id: string;
}

function defaultCompilerFactory(apiKey: string): IntentProfileCompilerService {
  return new CompositeIntentProfileCompiler([
    new GeminiIntentProfileCompiler({
      apiKey,
      model: process.env['GEMINI_INTENT_PROFILE_MODEL'] ?? 'gemini-2.5-flash',
    }),
    // Fallback that should never fire: if we got here, we want the real
    // Gemini result. The compiler_model assertion below catches the case
    // where Gemini's call quietly cascaded.
    new FallbackIntentProfileCompiler({ id: 'fallback-noop-intent-profile' }),
  ]);
}

/** Race a promise against a timer. No new deps. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${String(ms)}ms`)), ms);
    timer.unref?.();
  });
  try {
    const result: T = await Promise.race<T>([p, timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runOnboardingSmoke(
  input: OnboardingInput,
  deps: OnboardingDeps = {},
): Promise<OnboardingOutcome> {
  const envKey = deps.envKeyResolver ? deps.envKeyResolver() : process.env['GEMINI_API_KEY'];
  if (!hasRealGeminiKey({ GEMINI_API_KEY: envKey })) {
    // eslint-disable-next-line no-console
    console.log('intent-profile smoke skipped: no GEMINI_API_KEY');
    return { skipped: true, reason: 'no GEMINI_API_KEY' };
  }

  const apiKey = envKey ?? '';
  const compiler = deps.compilerFactory
    ? deps.compilerFactory(apiKey)
    : defaultCompilerFactory(apiKey);

  let result;
  try {
    result = await withTimeout(
      compiler.compileIntentProfile({
        description: input.description,
        user_id: input.user_id,
        capabilities: [],
      }),
      60_000,
      'compileIntentProfile',
    );
  } catch (err: unknown) {
    if (isAuthShapedError(err)) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitized = redactApiKey(rawMsg, apiKey);
      console.error(`intent-profile smoke auth_failed: ${sanitized}`);
      return {
        skipped: false,
        auth_failed: true,
        error_message: sanitized,
      };
    }
    throw err;
  }

  // Validate explicitly at the eval boundary (the compiler already did this
  // internally, but re-asserting here makes the contract obvious).
  let profile: IntentProfile;
  try {
    profile = IntentProfileSchema.parse(result.profile);
  } catch {
    return {
      skipped: false,
      auth_failed: null,
      compiler_model: result.compiler_model,
      profile_valid: false,
    };
  }

  const outcome: OnboardingOutcome = {
    skipped: false,
    auth_failed: null,
    compiler_model: result.compiler_model,
    has_github_lens: typeof profile.lenses['github'] === 'string',
    rule_count: profile.rules.length,
    profile_valid: true,
  };
  const density = profile.global_preferences['density'];
  if (typeof density === 'string') outcome.density = density;
  const automation = profile.global_preferences['automation_trust'];
  if (typeof automation === 'string') outcome.automation_trust = automation;
  return outcome;
}

export default defineEval({
  id: 'end-to-end/intent-profile-onboarding',
  description:
    'Real Gemini compileIntentProfile() — profile validates, github lens set, density compact, automation_trust strict-or-cautious.',
  kind: 'end-to-end',
  tags: ['smoke', 'gemini', 'live'],
  timeoutMs: 90_000,
  input: {
    description:
      "I review GitHub PRs in the morning, I'm a Linux developer, I prefer compact UIs and dark mode, I'm wary of automation.",
    user_id: 'smoke-onboard-user',
  } satisfies OnboardingInput,
  run: runOnboardingSmoke,
  expected: (output: unknown): boolean => {
    const o = output as OnboardingOutcome;
    if (o.skipped) return o.reason === 'no GEMINI_API_KEY';
    if (o.auth_failed === true) return false;
    if (o.profile_valid !== true) return false;
    if (o.has_github_lens !== true) return false;
    if (o.density !== 'compact') return false;
    if (o.automation_trust !== 'strict' && o.automation_trust !== 'cautious') return false;
    return true;
  },
});
