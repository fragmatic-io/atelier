// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Manifest endpoint. The runtime's `ManifestFetcher` calls
 * `GET /api/manifest/{user_id}/{app_id}/{encodedRoute}`. We delegate to
 * the server-side `ServerManifestResolver` which checks the Tier-3
 * `ManifestStore`, falls back to the composite compiler on miss,
 * validates against `BASELINE_POLICIES`, stores the result, and emits a
 * `manifest.compiled` audit event before returning the manifest.
 *
 * The `apps/demo-github` app uses `/api/manifest/...` (no `cir/`
 * intermediary) — kept consistent with `apps/demo`. The `[...slug]`
 * dynamic segment captures the user_id / app_id / route triple.
 */

import { NextResponse } from 'next/server';
import { getCirServer } from '@/lib/cir-server';

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
      // Concrete few-shot grounding for the LLM. The framework's prompt is
      // structure-only; this gives the host's catalog vocabulary as a real
      // prior example. Per `docs/ethos.md`: prompts are framework-level,
      // concrete examples are per-host.
      fewShotExample: server.fewShotExample,
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
