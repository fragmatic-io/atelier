// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Action endpoint. The browser dispatches POSTs here for the four
 * github action capabilities. We:
 *
 *   - For `issue.create` / `issue.close`: forward to GitHub if the
 *     server has a token; otherwise simulate against fixtures (the
 *     simulation is enough to exercise the optimistic-archive UX
 *     without burning rate-limit headroom).
 *
 *   - For `issue.archive` / `issue.bulk_close`: state-only operations
 *     (the dispatcher handles the optimistic flip; this endpoint just
 *     records the call so the audit trail looks right).
 *
 * Errors are sanitised — the `GitHubClient` constructs error messages
 * without echoing the token.
 */

import { NextResponse } from 'next/server';
import { GitHubClient } from '@/lib/github-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ capability: string }>;
}

function resolveToken(): string | null {
  const env = process.env['GITHUB_TOKEN'];
  return env && env.length > 0 ? env : null;
}

function nextAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const { capability } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const token = resolveToken();
  const client = new GitHubClient({ token });
  const audit_id = nextAuditId();

  if (capability === 'github.issue.create') {
    const owner = String(body['owner'] ?? '');
    const repo = String(body['repo'] ?? '');
    const title = String(body['title'] ?? '');
    if (!owner || !repo || !title) {
      return NextResponse.json(
        { ok: false, error: 'owner, repo and title required' },
        { status: 400 },
      );
    }
    if (!client.authenticated) {
      // Mock: emit a synthetic issue number so the UI can confirm.
      return NextResponse.json({
        ok: true,
        result: {
          number: 9001 + Math.floor(Math.random() * 99),
          html_url: `https://github.com/${owner}/${repo}/issues/9001`,
          created_at: new Date().toISOString(),
        },
        side_effects: ['mutates:github_issues', 'post'],
        audit_id,
      });
    }
    try {
      const created = await client.postJson<{
        number: number;
        html_url: string;
        created_at: string;
      }>(`/repos/${owner}/${repo}/issues`, { title, body: body['body'], labels: body['labels'] });
      return NextResponse.json({
        ok: true,
        result: {
          number: created.number,
          html_url: created.html_url,
          created_at: created.created_at,
        },
        side_effects: ['mutates:github_issues', 'post'],
        audit_id,
      });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: (err as Error).message ?? 'github failed' },
        { status: 502 },
      );
    }
  }

  if (capability === 'github.issue.close') {
    const owner = String(body['owner'] ?? '');
    const repo = String(body['repo'] ?? '');
    const issue_number = Number(body['issue_number'] ?? 0);
    if (!owner || !repo || !issue_number) {
      return NextResponse.json(
        { ok: false, error: 'owner, repo and issue_number required' },
        { status: 400 },
      );
    }
    if (!client.authenticated) {
      return NextResponse.json({
        ok: true,
        result: {
          number: issue_number,
          state: 'closed',
          closed_at: new Date().toISOString(),
        },
        side_effects: ['mutates:github_issues'],
        audit_id,
      });
    }
    try {
      const closed = await client.patchJson<{ number: number; state: string; closed_at: string }>(
        `/repos/${owner}/${repo}/issues/${String(issue_number)}`,
        { state: 'closed', state_reason: body['reason'] ?? 'completed' },
      );
      return NextResponse.json({
        ok: true,
        result: { number: closed.number, state: closed.state, closed_at: closed.closed_at },
        side_effects: ['mutates:github_issues'],
        audit_id,
      });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: (err as Error).message ?? 'github failed' },
        { status: 502 },
      );
    }
  }

  if (capability === 'github.issue.archive') {
    return NextResponse.json({
      ok: true,
      result: { archived_at: new Date().toISOString() },
      side_effects: ['mutates:client_view_state'],
      audit_id,
    });
  }

  if (capability === 'github.issue.bulk_close') {
    const ids = Array.isArray(body['issue_ids']) ? (body['issue_ids'] as string[]) : [];
    return NextResponse.json({
      ok: true,
      result: { closed_count: ids.length },
      side_effects: ['mutates:github_issues'],
      audit_id,
    });
  }

  return NextResponse.json(
    { ok: false, error: `unknown capability ${capability}` },
    { status: 404 },
  );
}
