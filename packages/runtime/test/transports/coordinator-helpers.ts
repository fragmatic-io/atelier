// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Test helper — spawn a real Node `http.Server` wrapping a coordinator
 * handler, return its base URL + a `close()` Promise that waits for the
 * socket to release. Used by the SSE transport + coordinator integration
 * tests.
 */

import { createServer, type Server } from 'node:http';
import type { TriggerCoordinator } from '../../src/transports/trigger-coordinator.js';

export interface CoordinatorHandle {
  /** Base URL — e.g. `http://127.0.0.1:54321`. No trailing slash. */
  url: string;
  /** Underlying HTTP server. Test-only; do not use in production. */
  server: Server;
  /** Close the listener and resolve when the socket is released. */
  close: () => Promise<void>;
}

export function startCoordinatorServer(
  coordinator: TriggerCoordinator,
): Promise<CoordinatorHandle> {
  return new Promise((resolve, reject) => {
    const server = createServer(coordinator.handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('coordinator server returned no address'));
        return;
      }
      const url = `http://127.0.0.1:${addr.port}`;
      const close = (): Promise<void> =>
        new Promise<void>((res, rej) => {
          server.closeAllConnections?.();
          server.close((err) => {
            if (err) rej(err);
            else res();
          });
        });
      resolve({ url, server, close });
    });
  });
}
