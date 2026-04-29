// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * SSE endpoint. The demo's `SseTriggerTransport` connects here and listens
 * for trigger events broadcast by `/api/triggers/publish`.
 */

import { addClient, removeClient } from '@/lib/trigger-bus-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(req: Request): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addClient(controller);
      // Send a comment line as a keep-alive so the browser knows we're up.
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));
      const onAbort = (): void => {
        removeClient(controller);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener('abort', onAbort);
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
