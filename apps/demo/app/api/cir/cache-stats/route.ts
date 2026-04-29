// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * GET /api/cir/cache-stats — returns the Tier-3 manifest store's stats.
 * Polled by the demo's DebugPanel.
 */

import { NextResponse } from 'next/server';
import type { ManifestStoreKey, StoredManifest } from '@cir/compiler';
import { getCirServer } from '@/lib/cir-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const server = getCirServer();
  const storeStats = await server.store.stats();
  const auditStats = server.audit.stats();
  const entries = await server.store.list();
  return NextResponse.json({
    gemini_available: server.geminiAvailable,
    store: storeStats,
    audit: auditStats,
    entries: entries.map((e: { key: ManifestStoreKey; value: StoredManifest }) => ({
      key: e.key,
      compiler_id: e.value.compiler_id,
      compiled_at: e.value.compiled_at,
      last_used: e.value.last_used,
      token_cost: e.value.token_cost,
    })),
  });
}
