// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Manifest endpoint. The runtime's `ManifestFetcher` calls
 * `GET /api/cir/manifest/{user_id}/{app_id}/{encodedRoute}` with an
 * `x-cir-density` header indicating the active lens. We mirror that
 * header onto the server-bound singleton so the FallbackCompiler picks
 * the right variant.
 */

import { NextResponse } from 'next/server';
import { densityFromRequest, getCirServer } from '@/lib/atelier-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ slug: string[] }>;
}

export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;
  if (slug.length < 3) {
    return NextResponse.json(
      { error: 'expected /api/cir/manifest/{user_id}/{app_id}/{route}' },
      { status: 400 },
    );
  }
  const [user_id, app_id, ...routeParts] = slug;
  const route = routeParts.join('/');
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;

  const server = getCirServer();
  // Mirror the lens onto the singleton so the fallback `lookup` closure
  // produces the right manifest variant.
  server.density = densityFromRequest(req);

  try {
    const result = await server.resolver.resolve({
      user_id: user_id!,
      app_id: app_id!,
      route: normalizedRoute,
      capabilities: server.capabilities,
      components: server.components,
      brandKit: server.brandKit,
      // Per `docs/ethos.md`: prompts are framework-level, concrete
      // examples per-host. We feed the canonical fallback manifest for
      // `/browse` as the LLM's few-shot grounding so Gemini learns this
      // app's composition pattern (Stack/Logo/NavBar/StatusBar chrome,
      // Grid+Card tile pattern, CartItemList, etc.) rather than guessing
      // from descriptions alone.
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
        'x-cir-density': server.density,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}
