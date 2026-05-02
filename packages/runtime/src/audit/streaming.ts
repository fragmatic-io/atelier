// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * StreamingAuditSink — buffered ring-buffer sink with subscriber callbacks.
 *
 * Used to feed live audit events to the `<DebugPanel>` UI in `@atelier/react`,
 * and to expose the last N events via an HTTP endpoint for tools/dashboards.
 *
 * The buffer is bounded; oldest entries drop when full. Subscribe at any
 * time and you'll start receiving new events; you do NOT receive a backfill
 * unless you call `recent()` explicitly first (intentional — most consumers
 * want a snapshot + live tail, not duplicate processing).
 */

import type { AuditEvent } from '@atelier/schemas';
import type { AuditSink } from './emit.js';

export interface StreamingAuditSinkOptions {
  /** Max events to retain in the ring buffer. Default 200. */
  bufferSize?: number;
  /** If true, also forward events to console.debug. Default false. */
  echoToConsole?: boolean;
}

export type AuditListener = (event: AuditEvent) => void;

const DEFAULT_BUFFER = 200;

export class StreamingAuditSink implements AuditSink {
  readonly #buffer: AuditEvent[] = [];
  readonly #listeners = new Set<AuditListener>();
  readonly #bufferSize: number;
  readonly #echo: boolean;
  /** Total events ever emitted (incl. dropped). Useful for cache-hit-rate math. */
  #totalCount = 0;
  #compiledCount = 0;
  #servedCount = 0;
  #totalTokens = 0;

  constructor(opts: StreamingAuditSinkOptions = {}) {
    this.#bufferSize = Math.max(1, opts.bufferSize ?? DEFAULT_BUFFER);
    this.#echo = opts.echoToConsole ?? false;
  }

  emit(event: AuditEvent): void {
    this.#buffer.push(event);
    if (this.#buffer.length > this.#bufferSize) this.#buffer.shift();
    this.#totalCount += 1;
    if (event.type === 'manifest.compiled') {
      this.#compiledCount += 1;
      this.#totalTokens += event.token_cost ?? 0;
    } else if (event.type === 'manifest.served') {
      this.#servedCount += 1;
    }
    if (this.#echo) {
      // eslint-disable-next-line no-console
      console.debug('[cir.audit]', event.type, event);
    }
    for (const l of this.#listeners) {
      try {
        l(event);
      } catch {
        // A misbehaving listener can't poison the bus.
      }
    }
  }

  /** Snapshot of the most recent events (oldest first). */
  recent(): readonly AuditEvent[] {
    return [...this.#buffer];
  }

  /** Subscribe to new events. Returns an unsubscribe fn. */
  subscribe(listener: AuditListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Aggregate stats for cache-hit-rate / token-spend dashboards. */
  stats(): {
    total: number;
    compiled: number;
    served: number;
    cache_hit_rate: number;
    total_tokens: number;
  } {
    const denom = this.#compiledCount + this.#servedCount;
    return {
      total: this.#totalCount,
      compiled: this.#compiledCount,
      served: this.#servedCount,
      cache_hit_rate: denom === 0 ? 0 : this.#servedCount / denom,
      total_tokens: this.#totalTokens,
    };
  }

  /** Clear the buffer + listener counters (preserves listeners). */
  reset(): void {
    this.#buffer.length = 0;
    this.#totalCount = 0;
    this.#compiledCount = 0;
    this.#servedCount = 0;
    this.#totalTokens = 0;
  }
}
