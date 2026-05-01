// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * POST /api/cir/onboarding/compile — light variant of the apps/demo
 * onboarding compile route. The dummyjson catalog demo doesn't strictly
 * need onboarding (guests browse fine; only the lens picker writes
 * intent), so this endpoint is a thin pass-through that turns a
 * free-text description into a default profile via the fallback
 * compiler. Wired here for parity with apps/demo and so any
 * personalisation work the user wants (vocabulary, additional rules)
 * has somewhere to land.
 */

import { NextResponse } from 'next/server';
import {
  CompositeIntentProfileCompiler,
  FallbackIntentProfileCompiler,
  GeminiIntentProfileCompiler,
  type IntentProfileCompilerService,
} from '@cir/compiler';
import type { Capability } from '@cir/schemas';
import { getCirServer } from '@/lib/cir-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CompileRequestBody {
  description: string;
  user_id: string;
}

function validate(raw: unknown): CompileRequestBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'body must be a JSON object' };
  const r = raw as { description?: unknown; user_id?: unknown };
  if (typeof r.description !== 'string') return { error: 'description must be a string' };
  if (r.description.length > 4000) return { error: 'description must be <= 4000 chars' };
  if (typeof r.user_id !== 'string' || r.user_id.length === 0) {
    return { error: 'user_id must be a non-empty string' };
  }
  return { description: r.description, user_id: r.user_id };
}

function buildCompiler(): IntentProfileCompilerService {
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

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const v = validate(raw);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const server = getCirServer();
  const capabilities = Object.values(server.capabilities) as ReadonlyArray<Capability>;
  const compiler = buildCompiler();
  try {
    const result = await compiler.compileIntentProfile({
      description: v.description,
      user_id: v.user_id,
      capabilities,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}
