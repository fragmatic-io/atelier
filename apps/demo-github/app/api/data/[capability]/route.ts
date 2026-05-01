// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Server-side data proxy. The browser-side `RestDataResolver` issues
 * `GET /api/data/<capability>?filter=...` requests; this route either:
 *
 *   - Calls real GitHub when a token is configured (via `GITHUB_TOKEN`
 *     env or the vault). Returns the parsed JSON body in the same shape
 *     the fixture resolver returns, so the rendering surface is unaware
 *     of which one served it.
 *
 *   - Falls back to fixture data (the same `FIXTURE_*` arrays the
 *     browser uses on first paint).
 *
 * The proxy never echoes the token in error messages — the
 * `buildErrorMessage` helper in `lib/github-client` strips secrets.
 */

import { NextResponse } from 'next/server';
import {
  GitHubClient,
  getRateLimitState,
  listIssuesFixture,
  listReposFixture,
} from '@/lib/github-client';
import { FIXTURE_ISSUES } from '@/lib/github-fixtures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ capability: string[] | string }>;
}

function resolveToken(): string | null {
  // Server side: env wins. The vault-backed token is read by the browser
  // and travels via the request headers — since the demo doesn't ship
  // a per-request auth header today, env is the canonical server source.
  const env = process.env['GITHUB_TOKEN'];
  return env && env.length > 0 ? env : null;
}

export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const raw = (await params).capability;
  // Next's `[capability]` is single-segment, but we accept the typed shape.
  const capability = Array.isArray(raw) ? raw.join('.') : raw;
  const url = new URL(req.url);
  const filter = url.searchParams.get('filter') ?? '';

  const token = resolveToken();
  const client = new GitHubClient({ token });

  if (capability === 'github.repo.list') {
    if (!client.authenticated) {
      return NextResponse.json({ repos: listReposFixture() });
    }
    try {
      const repos = await client.getJson<unknown[]>(`/user/repos?per_page=20`);
      return NextResponse.json(
        { repos },
        { headers: { 'x-cir-rate-limit': JSON.stringify(getRateLimitState()) } },
      );
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message ?? 'github failed' },
        { status: 500 },
      );
    }
  }

  if (capability === 'github.issue.list') {
    // The fixture flow handles all filtering client-side; the live flow
    // hits `/issues` and lets the renderer apply the same logic.
    if (!client.authenticated) {
      return NextResponse.json({ issues: listIssuesFixture() });
    }
    try {
      const issues = await client.getJson<unknown[]>(`/issues?filter=assigned&per_page=25`);
      return NextResponse.json(
        { issues },
        { headers: { 'x-cir-rate-limit': JSON.stringify(getRateLimitState()) } },
      );
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message ?? 'github failed' },
        { status: 500 },
      );
    }
  }

  if (capability === 'github.issue.get') {
    // Tiny ad-hoc parser for `number = <n>` filter.
    const m = /number\s*=\s*(\d+)/.exec(filter);
    const number = m?.[1] ? Number.parseInt(m[1], 10) : null;
    if (number === null) {
      return NextResponse.json(
        { error: 'github.issue.get expects filter `number = <n>`' },
        { status: 400 },
      );
    }
    const issue = FIXTURE_ISSUES.find((i) => i.number === number) ?? null;
    if (issue === null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ issue });
  }

  return NextResponse.json({ error: `unknown capability ${capability}` }, { status: 404 });
}
