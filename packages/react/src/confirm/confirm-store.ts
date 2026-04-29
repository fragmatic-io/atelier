// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Tiny external store for the confirmation portal. We need this because
 * `ConfirmationCallback` is invoked from outside React (the dispatcher's
 * async path) and React state setters can't be called from there safely.
 *
 * The store is `useSyncExternalStore`-compatible: `subscribe` registers a
 * listener, `getSnapshot` returns the current head request (or null), and
 * `enqueue` / `resolveHead` mutate while notifying subscribers.
 *
 * Only the head of the queue is exposed via `getSnapshot` — that's what the
 * portal renders. Subsequent requests sit invisibly until the head resolves.
 */

import type { ConfirmationDecision, ConfirmationRequest } from '@cir/runtime';

export interface PendingConfirmation {
  request: ConfirmationRequest;
  resolve: (decision: ConfirmationDecision) => void;
}

export interface ConfirmStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PendingConfirmation | null;
  enqueue(item: PendingConfirmation): void;
  /** Resolve the head with a decision and advance the queue. */
  resolveHead(decision: ConfirmationDecision): void;
  /** Test helper: total queue size. */
  size(): number;
}

export function createConfirmStore(): ConfirmStore {
  const queue: PendingConfirmation[] = [];
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const l of listeners) l();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return queue[0] ?? null;
    },
    enqueue(item) {
      queue.push(item);
      notify();
    },
    resolveHead(decision) {
      const head = queue.shift();
      if (!head) return;
      head.resolve(decision);
      notify();
    },
    size() {
      return queue.length;
    },
  };
}
