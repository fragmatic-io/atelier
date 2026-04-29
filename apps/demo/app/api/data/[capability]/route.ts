// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Fake data endpoint. The demo's `DataResolver` (in `lib/cir-providers.tsx`)
 * fetches from here based on the manifest's component data binding spec.
 *
 * In a real CIR app this would be the host's typed query layer (REST,
 * GraphQL, in-process call) gated by the Action Gateway and the user's
 * granted_fields.
 */

import { NextResponse } from 'next/server';
import { getStore } from '@/lib/fake-data';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ capability: string }>;
}

export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const { capability } = await params;
  const url = new URL(req.url);
  const filter = url.searchParams.get('filter') ?? '';

  const store = getStore();

  if (capability === 'thread.list') {
    let threads = store.threads.filter((t) => !t.archived);
    if (filter.includes('requires_decision = true')) {
      threads = threads.filter((t) => t.requires_decision);
    }
    return NextResponse.json({ threads });
  }

  if (capability === 'task.list') {
    return NextResponse.json({ tasks: store.tasks });
  }

  return NextResponse.json({ error: `unknown capability ${capability}` }, { status: 404 });
}
