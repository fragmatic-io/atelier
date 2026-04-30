// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * POST /api/cir/onboarding/compile — server route that takes the user's
 * free-text self-description and returns a draft `IntentProfile` for them
 * to review.
 *
 * The description is request-scoped only; never persisted server-side.
 * Per docs/artifacts.md §"The vault" + the LLM-onboarding privacy posture,
 * the raw text leaves on the wire to Gemini once and is then dropped on the
 * floor. Only the structured profile flows further (and only after the user
 * approves it on `/onboarding/review`).
 *
 * Validation + compile is in `lib/onboarding-compile.ts` so the unit test
 * can exercise the contract without importing Next.js server machinery.
 */

import { NextResponse } from 'next/server';
import type { Capability } from '@cir/schemas';
import { buildIntentProfileCompiler, handleCompileRequest } from '@/lib/onboarding-compile';
import { getCirServer } from '@/lib/cir-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // description is request-scoped only; never persisted.
  const server = getCirServer();
  const capabilities = Object.values(server.capabilities) as ReadonlyArray<Capability>;
  const compiler = buildIntentProfileCompiler();

  const { status, body } = await handleCompileRequest(raw, { compiler, capabilities });
  return NextResponse.json(body, { status });
}
