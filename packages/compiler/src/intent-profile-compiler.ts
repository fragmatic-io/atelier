// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Intent profile compiler service — translates a user's free-text
 * self-description into a draft `IntentProfile` for review.
 *
 * Three implementations:
 *   - `GeminiIntentProfileCompiler`: LLM-backed via @google/genai. Calls the
 *     prompt builder in `prompts/intent-profile-builder.ts`, validates the
 *     output against `IntentProfileSchema`, and retries once on validation
 *     failure with the error reason injected into the prompt.
 *   - `FallbackIntentProfileCompiler`: pure deterministic. Keyword heuristics
 *     for common preferences (GitHub, shopping, density, color mode, automation
 *     trust). Used when the LLM is unavailable or for offline tests.
 *   - `CompositeIntentProfileCompiler`: tries services in order; falls back
 *     on any throw. The last service is the source of truth for the reported
 *     `compiler_model`.
 *
 * Critical contract: the compiler returns a DRAFT. The caller (the demo's
 * `/onboarding/review` page) is the human gate before persistence — these
 * classes never touch the vault or localStorage.
 */

import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import {
  IntentProfileSchema,
  toJsonSchema,
  type BrandKit,
  type Capability,
  type IntentProfile,
  type IntentRule,
} from '@cir/schemas';
import {
  buildIntentProfilePrompt,
  INTENT_PROFILE_SYSTEM_PROMPT,
  INTENT_PROFILE_SYSTEM_PROMPT_VERSION,
} from './prompts/intent-profile-builder.js';
import { CompilerOutputError, CompilerUnavailableError } from './types.js';

export interface CompileIntentProfileInput {
  description: string;
  user_id: string;
  capabilities: ReadonlyArray<Capability>;
  brand_kit?: BrandKit;
}

export interface CompileIntentProfileResult {
  profile: IntentProfile;
  /** Identifier of the model / service that produced the draft. */
  compiler_model: string;
  /** Total tokens consumed (prompt + response). 0 for non-LLM compilers. */
  token_cost: number;
  /** Approximate prompt size in characters. Useful for budget audits. */
  prompt_size: number;
}

export interface IntentProfileCompileOptions {
  signal?: AbortSignal;
}

export interface IntentProfileCompilerService {
  readonly id: string;
  compileIntentProfile(
    input: CompileIntentProfileInput,
    opts?: IntentProfileCompileOptions,
  ): Promise<CompileIntentProfileResult>;
}

// ---------------------------------------------------------------------------
// Gemini-backed compiler
// ---------------------------------------------------------------------------

export interface GeminiIntentProfileCompilerOptions {
  apiKey: string;
  /** Default 'gemini-2.5-flash' — onboarding is a small / one-shot prompt. */
  model?: string;
  client?: GoogleGenAI;
  /** Maximum retries on parse / validation failure. Default 1. */
  maxRetries?: number;
}

const DEFAULT_INTENT_MODEL = 'gemini-2.5-flash';

export class GeminiIntentProfileCompiler implements IntentProfileCompilerService {
  readonly id: string;
  readonly #client: GoogleGenAI;
  readonly #model: string;
  readonly #maxRetries: number;

  constructor(opts: GeminiIntentProfileCompilerOptions) {
    if (!opts.apiKey) {
      throw new CompilerUnavailableError('GeminiIntentProfileCompiler requires an apiKey');
    }
    this.#client = opts.client ?? new GoogleGenAI({ apiKey: opts.apiKey });
    this.#model = opts.model ?? DEFAULT_INTENT_MODEL;
    this.#maxRetries = opts.maxRetries ?? 1;
    this.id = `gemini-intent-profile-compiler[${this.#model},sys@${INTENT_PROFILE_SYSTEM_PROMPT_VERSION}]`;
  }

  async compileIntentProfile(
    input: CompileIntentProfileInput,
    opts: IntentProfileCompileOptions = {},
  ): Promise<CompileIntentProfileResult> {
    const ctx = buildIntentProfilePrompt({
      description: input.description,
      user_id: input.user_id,
      capabilities: input.capabilities,
    });

    const responseSchema = toJsonSchema(IntentProfileSchema, {
      name: 'intent_profile',
      target: 'jsonSchema7',
    });

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      const userMessage =
        attempt === 0
          ? ctx.user
          : `${ctx.user}\n\n## Previous attempt failed validation\n${formatValidationError(lastError)}\n\nFix and re-emit. Output ONLY the corrected IntentProfile JSON.`;

      const config: GenerateContentConfig = {
        systemInstruction: INTENT_PROFILE_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.2,
      };
      if (opts.signal !== undefined) config.abortSignal = opts.signal;

      const response = await this.#client.models.generateContent({
        model: this.#model,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config,
      });

      const text = response.text ?? '';
      const tokenCost =
        (response.usageMetadata?.promptTokenCount ?? 0) +
        (response.usageMetadata?.candidatesTokenCount ?? 0);

      let profile: IntentProfile;
      try {
        const parsed = JSON.parse(text) as unknown;
        profile = IntentProfileSchema.parse(parsed);
      } catch (err) {
        lastError = err;
        if (attempt === this.#maxRetries) {
          throw new CompilerOutputError(
            `Gemini intent profile output failed validation after ${String(attempt + 1)} attempts`,
            err,
          );
        }
        continue;
      }

      return {
        profile,
        compiler_model: this.#model,
        token_cost: tokenCost,
        prompt_size: ctx.user.length,
      };
    }

    throw new CompilerOutputError('GeminiIntentProfileCompiler exhausted retries', lastError);
  }
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

export interface FallbackIntentProfileCompilerOptions {
  /** Identifier surfaced as `compiler_model`. Default 'fallback-intent-profile'. */
  id?: string;
  /** Override clock for deterministic tests. */
  now?: () => Date;
}

export class FallbackIntentProfileCompiler implements IntentProfileCompilerService {
  readonly id: string;
  readonly #now: () => Date;

  constructor(opts: FallbackIntentProfileCompilerOptions = {}) {
    this.id = opts.id ?? 'fallback-intent-profile';
    this.#now = opts.now ?? ((): Date => new Date());
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async compileIntentProfile(
    input: CompileIntentProfileInput,
  ): Promise<CompileIntentProfileResult> {
    const trimmed = input.description.trim();
    const lower = trimmed.toLowerCase();

    const lenses: Record<string, string> = {};
    const rules: IntentRule[] = [];
    const globalPreferences: Record<string, unknown> = {
      density: 'comfortable',
    };
    const vocabulary: Record<string, unknown> = {};

    if (trimmed.length === 0) {
      return this.#emit({ lenses, rules, globalPreferences, vocabulary }, input);
    }

    // GitHub / code review.
    if (
      lower.includes('github') ||
      lower.includes('pull request') ||
      lower.includes(' pr ') ||
      lower.includes('code review')
    ) {
      lenses['github'] = 'reviewer';
    }

    // Shopping / commerce.
    if (
      lower.includes('shopping') ||
      lower.includes('products') ||
      // "shop" as a verb / noun anywhere in a word boundary; matches "I shop",
      // "online shop", "shopping". Excludes "shoplifter" → still hits but the
      // false-positive cost is low for an onboarding draft the user reviews.
      /\bshop\b/.test(lower) ||
      / buy\b/.test(lower) ||
      lower.startsWith('buy ')
    ) {
      lenses['shopping'] = 'browser';
    }

    // Time-of-day preference.
    if (lower.includes('morning') || / am\b/.test(lower)) {
      rules.push({
        scope: '*',
        rule: 'Surface morning-relevant items first.',
        version: 1,
      });
    }

    // Density.
    if (lower.includes('compact') || lower.includes('dense')) {
      globalPreferences['density'] = 'compact';
    }

    // Color mode.
    if (lower.includes('dark')) {
      globalPreferences['color_mode'] = 'dark';
    }

    // Automation trust.
    if (
      lower.includes('never') ||
      lower.includes('always confirm') ||
      lower.includes('no automation') ||
      lower.includes('wary of automation')
    ) {
      globalPreferences['automation_trust'] = 'strict';
      rules.push({
        scope: '*',
        rule: 'Always confirm before acting; never auto-execute.',
        version: 1,
        locked: true,
      });
    }

    return this.#emit({ lenses, rules, globalPreferences, vocabulary }, input);
  }

  #emit(
    parts: {
      lenses: Record<string, string>;
      rules: IntentRule[];
      globalPreferences: Record<string, unknown>;
      vocabulary: Record<string, unknown>;
    },
    input: CompileIntentProfileInput,
  ): CompileIntentProfileResult {
    const profile: IntentProfile = IntentProfileSchema.parse({
      user_id: input.user_id,
      profile_version: 1,
      updated_at: this.#now().toISOString(),
      global_preferences: parts.globalPreferences,
      lenses: parts.lenses,
      rules: parts.rules,
      vocabulary: parts.vocabulary,
      cross_app_workflows: [],
    });
    return {
      profile,
      compiler_model: this.id,
      token_cost: 0,
      prompt_size: input.description.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Composite — try services in order, fall back on throw
// ---------------------------------------------------------------------------

export interface CompositeIntentProfileCompilerOptions {
  /** Optional logger fired on each cascade. Receives the failed service id and the error. */
  onCascade?: (from: string, error: unknown) => void;
}

export class CompositeIntentProfileCompiler implements IntentProfileCompilerService {
  readonly id: string;
  readonly #services: readonly IntentProfileCompilerService[];
  readonly #onCascade: ((from: string, error: unknown) => void) | undefined;

  constructor(
    services: readonly IntentProfileCompilerService[],
    opts: CompositeIntentProfileCompilerOptions = {},
  ) {
    if (services.length === 0) {
      throw new Error('CompositeIntentProfileCompiler requires at least one service');
    }
    this.#services = services;
    this.#onCascade = opts.onCascade;
    this.id = `composite-intent-profile[${services.map((s) => s.id).join(',')}]`;
  }

  async compileIntentProfile(
    input: CompileIntentProfileInput,
    opts?: IntentProfileCompileOptions,
  ): Promise<CompileIntentProfileResult> {
    let lastError: unknown;
    for (const svc of this.#services) {
      try {
        return await svc.compileIntentProfile(input, opts);
      } catch (err) {
        lastError = err;
        this.#onCascade?.(svc.id, err);
      }
    }
    throw new CompilerOutputError(
      `CompositeIntentProfileCompiler exhausted all services (${String(this.#services.length)})`,
      lastError,
    );
  }
}

function formatValidationError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  }
  return String(err);
}
