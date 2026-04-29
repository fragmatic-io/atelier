// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * GET /api/cir/audit-events — snapshot of the last N audit events from the
 * server's StreamingAuditSink.
 *
 * The browser-side DebugPanel mostly listens to its OWN local audit stream
 * for low latency, but this endpoint exposes the SERVER's compile events
 * (which the browser doesn't see) for cross-process observability.
 */

import { NextResponse } from 'next/server';
import { getCirServer } from '@/lib/cir-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const server = getCirServer();
  return NextResponse.json({
    events: server.audit.recent(),
    stats: server.audit.stats(),
  });
}
