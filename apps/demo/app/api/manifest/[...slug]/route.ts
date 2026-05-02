// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Manifest endpoint. The runtime's `ManifestFetcher` calls
 * `GET /api/manifest/{user_id}/{app_id}/{encodedRoute}`. We delegate to the
 * server-side `ServerManifestResolver`, which:
 *   1. Checks the Tier-3 ManifestStore (server cache)
 *   2. On miss, calls the CompositeCompiler (Gemini → fallback)
 *   3. Validates the result via `@atelier/policies` BASELINE_POLICIES
 *   4. Stores the result, emits `manifest.compiled` audit
 *   5. Returns the manifest
 *
 * Phase 5a swap-in. Replaces the previous fake `manifestForRoute()` direct call.
 */

import { NextResponse } from 'next/server';
import { getCirServer } from '@/lib/atelier-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ slug: string[] }>;
}

export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;
  if (slug.length < 3) {
    return NextResponse.json(
      { error: 'expected /api/manifest/{user_id}/{app_id}/{route}' },
      { status: 400 },
    );
  }
  const [user_id, app_id, ...routeParts] = slug;
  const route = routeParts.join('/');
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;

  const server = getCirServer();

  try {
    const result = await server.resolver.resolve({
      user_id: user_id!,
      app_id: app_id!,
      route: normalizedRoute,
      capabilities: server.capabilities,
      components: server.components,
      brandKit: server.brandKit,
      signal: req.signal,
    });

    return NextResponse.json(result.manifest, {
      headers: {
        'cache-control': 'no-store',
        ETag: `"${result.manifest.manifest_id}"`,
        'x-cir-source': result.source,
        'x-cir-compiler': result.compiler_id,
        'x-cir-tokens': String(result.token_cost),
        'x-cir-duration-ms': String(result.duration_ms),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}
