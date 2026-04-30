// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Pure helper used by `app/api/cir/onboarding/compile/route.ts`.
 *
 * Splits the validation + compile work out of the route file so the unit
 * test can exercise it without importing Next.js server machinery
 * (`@/lib/cir-server`, `getCirServer()`, etc.) or mocking the App Router.
 *
 * The route is a thin adapter on top of this; production paths import the
 * compiler factory from here, the test injects a stub compiler.
 */

import type { Capability } from '@cir/schemas';
import {
  CompositeIntentProfileCompiler,
  FallbackIntentProfileCompiler,
  GeminiIntentProfileCompiler,
  type CompileIntentProfileResult,
  type IntentProfileCompilerService,
} from '@cir/compiler';

export interface CompileRequestBody {
  description: string;
  user_id: string;
}

export type ValidationResult =
  | { ok: true; body: CompileRequestBody }
  | { ok: false; error: string };

/**
 * Hand-rolled minimal input validator. We don't depend on zod directly in
 * the demo (no new deps); the schema is small enough to write by hand.
 */
export function validateCompileBody(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be a JSON object' };
  const r = raw as { description?: unknown; user_id?: unknown };
  if (typeof r.description !== 'string')
    return { ok: false, error: 'description must be a string' };
  if (r.description.length > 4000) return { ok: false, error: 'description must be <= 4000 chars' };
  if (typeof r.user_id !== 'string' || r.user_id.length === 0) {
    return { ok: false, error: 'user_id must be a non-empty string' };
  }
  return { ok: true, body: { description: r.description, user_id: r.user_id } };
}

/**
 * Build the composite compiler used by the route. Production wires Gemini
 * (when keyed) ahead of the deterministic fallback. Reads env at call time
 * so tests that override `process.env.GEMINI_API_KEY` see the change.
 */
export function buildIntentProfileCompiler(): IntentProfileCompilerService {
  const services: IntentProfileCompilerService[] = [];
  const apiKey = process.env['GEMINI_API_KEY'];
  if (apiKey && apiKey.length > 10) {
    services.push(
      new GeminiIntentProfileCompiler({
        apiKey,
        model: process.env['GEMINI_INTENT_PROFILE_MODEL'] ?? 'gemini-2.5-flash',
      }),
    );
  }
  services.push(new FallbackIntentProfileCompiler());
  return new CompositeIntentProfileCompiler(services);
}

export interface CompileHandlerDeps {
  compiler: IntentProfileCompilerService;
  capabilities: ReadonlyArray<Capability>;
}

export interface CompileHandlerResult {
  status: number;
  body:
    | { profile: CompileIntentProfileResult['profile']; compiler_model: string }
    | { error: string };
}

/**
 * Pure handler. Takes the parsed JSON body + DI deps, returns
 * `{ status, body }` so the route file just `NextResponse.json`s the body.
 *
 * description is request-scoped only; never persisted.
 */
export async function handleCompileRequest(
  raw: unknown,
  deps: CompileHandlerDeps,
): Promise<CompileHandlerResult> {
  const validated = validateCompileBody(raw);
  if (!validated.ok) {
    return { status: 400, body: { error: validated.error } };
  }
  const { description, user_id } = validated.body;

  try {
    const result = await deps.compiler.compileIntentProfile({
      description,
      user_id,
      capabilities: deps.capabilities,
    });
    return {
      status: 200,
      body: { profile: result.profile, compiler_model: result.compiler_model },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'compile failed';
    return { status: 500, body: { error: message } };
  }
}
