// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * POST a trigger payload here to broadcast it to every connected SSE client.
 *
 *   curl -XPOST http://localhost:3000/api/triggers/publish \
 *     -H 'content-type: application/json' \
 *     -d '{"type":"user.recompile_route","user_id":"demo-user","manifest_id":"m_demo_today","route":"/today"}'
 *
 * In real deployments this is the host's own publish path (writing to
 * Redis, NATS, etc.). For the demo it's a thin shim over the in-process
 * singleton.
 */

import { NextResponse } from 'next/server';
import { broadcast } from '@/lib/trigger-bus-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || typeof (body as { type?: unknown }).type !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'expected an object with a string `type` field' },
      { status: 400 },
    );
  }
  const delivered = broadcast(body);
  return NextResponse.json({ ok: true, delivered });
}
