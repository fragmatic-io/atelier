// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * POST /api/admin/patterns/promote
 *
 * Scaffolds a recipe stub at `recipes/_proposed/<pattern_id>.json` for a
 * detected pattern. The detector is re-seeded server-side from the same
 * deterministic synthetic stream the page uses (so the route is
 * idempotent for the demo).
 *
 * NOT a real promotion workflow. The full review flow is V-6 territory —
 * this endpoint only emits a stub for human review.
 */

import { NextResponse } from 'next/server';
import { renderPatternRows, seedDemoSequenceDetector, writeRecipeStub } from '@/lib/admin-patterns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PromoteRequest {
  pattern_id?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let raw: PromoteRequest;
  try {
    raw = (await request.json()) as PromoteRequest;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  if (typeof raw.pattern_id !== 'string' || raw.pattern_id.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'pattern_id must be a non-empty string' },
      { status: 400 },
    );
  }

  const detector = seedDemoSequenceDetector();
  const rows = renderPatternRows(detector);
  const row = rows.find((r) => r.pattern_id === raw.pattern_id);
  if (!row) {
    return NextResponse.json(
      { ok: false, error: `unknown pattern_id: ${raw.pattern_id}` },
      { status: 404 },
    );
  }

  const result = writeRecipeStub(
    {
      pattern_id: row.pattern_id,
      description: row.description,
      occurrences: row.occurrences,
    },
    row.capability_ids,
  );
  return NextResponse.json({ ok: true, ...result });
}
