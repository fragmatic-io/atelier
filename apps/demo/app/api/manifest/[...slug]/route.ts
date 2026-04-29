// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Fake compiler endpoint. The runtime's `ManifestFetcher` calls
 * `GET /api/manifest/{user_id}/{app_id}/{encodedRoute}`. We dispatch on
 * the route segment and return a hand-written manifest.
 *
 * In Phase 5 this endpoint becomes the real LLM-backed compiler service.
 */

import { NextResponse } from 'next/server';
import { manifestForRoute } from '@/lib/fake-manifests';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ slug: string[] }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;
  if (slug.length < 3) {
    return NextResponse.json(
      { error: 'expected /api/manifest/{user_id}/{app_id}/{route}' },
      { status: 400 },
    );
  }
  const route = slug.slice(2).join('/');
  // Route comes URL-decoded; slash leading is preserved as the first char of
  // the segment, except when the path was multi-segment we joined above.
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  const manifest = manifestForRoute(normalizedRoute);
  if (!manifest) {
    return NextResponse.json(
      { error: `no manifest for route ${normalizedRoute}` },
      { status: 404 },
    );
  }
  return NextResponse.json(manifest, {
    headers: { 'Cache-Control': 'no-store', ETag: `"${manifest.manifest_id}"` },
  });
}
