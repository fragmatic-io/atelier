// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * GET /api/cir/audit/stream — Server-Sent Events feed of audit events.
 *
 * The wire contract is documented in `packages/cli/README.md` §`cir dev --tail`
 * and consumed by:
 *   - `cir dev --tail` (terminal-side tailer in `@cir/cli`)
 *   - `<DebugPanel>` in `@cir/react/debug`
 *
 * Implementation lives in `lib/audit-stream.ts` so it's testable without
 * Next.js. This file just:
 *   1. Pulls the demo's process-wide `StreamingAuditSink` from `cir-server.ts`.
 *   2. Parses optional `?tenant_id` and `?type=` query filters.
 *   3. Hands both to `buildAuditStreamResponse()`.
 *
 * Query parameters:
 *   - `tenant_id` — narrow to events scoped to that tenant (plus any global
 *     events without a `tenant_id`). The demo isn't multi-tenant today, so
 *     this is mostly a contract-readiness hook for downstream hosts; events
 *     emitted by this demo carry no `tenant_id` and pass every filter.
 *   - `type` — comma-separated list of `AuditEventType` values. Only matching
 *     events flow through. Example: `?type=action.executed,policy.violated`.
 *
 * Heartbeat: every 15s the server writes `event: heartbeat\ndata: {}\n\n`
 * so a stale TCP connection is detected by the consumer.
 */

import { getCirServer } from '@/lib/cir-server';
import { buildAuditStreamResponse, parseTypesParam } from '@/lib/audit-stream';

// Match the existing SSE route in this app (apps/demo/app/api/triggers/stream)
// for parity. Edge runtime would also work, but the demo's server-side
// singleton (CompositeCompiler + StreamingAuditSink) lives in the Node
// process — keeping audit on Node avoids an Edge-vs-Node singleton split.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(req: Request): Response {
  const server = getCirServer();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id') ?? undefined;
  const types = parseTypesParam(url.searchParams.get('type'));

  return buildAuditStreamResponse({
    sink: server.audit,
    filters: {
      ...(tenantId !== undefined ? { tenant_id: tenantId } : {}),
      ...(types !== undefined ? { types } : {}),
    },
    signal: req.signal,
  });
}
