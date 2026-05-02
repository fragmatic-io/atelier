// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * AuditSink — caller-provided pluggable destination for `AuditEvent`s.
 *
 * The runtime never decides where audit lives; it only emits. Hosts wire a
 * sink that ships events to the audit log service (see
 * `/Users/vid/cir/docs/architecture.md` §"Audit log"). Two reference
 * implementations ship: `NoopAuditSink` (silent) and `ConsoleAuditSink`
 * (writes JSON lines to `console.warn` — `console.warn` because eslint's
 * `no-console` rule allows it).
 *
 * The runtime emits sink calls on:
 *  - `manifest.served` (resolver cache hit)
 *  - `manifest.compiled` (resolver cache miss + fetch — see comment on resolver)
 *  - `manifest.invalidated` (cache eviction via trigger)
 *  - `action.executed`
 *  - `action.denied` (validation failed, confirmation declined, no handler)
 *  - `policy.violated` (resolver-level validation rejection)
 */

import type { AuditEvent } from '@atelier/schemas';

/**
 * A pluggable audit destination. Implementations must NOT throw; if they
 * fail (e.g. transport error), they should swallow internally — auditing is
 * best-effort and never blocks the user-visible code path.
 */
export interface AuditSink {
  emit(event: AuditEvent): void | Promise<void>;
}

/** Drops every event. Default when the host does not provide a sink. */
export const NoopAuditSink: AuditSink = {
  emit(): void {
    // intentionally no-op
  },
};

/**
 * Writes one JSON line per event to `console.warn`. Useful in dev and tests
 * (where stdout/stderr capture is straightforward). Production hosts should
 * provide their own sink that ships to a real audit log.
 */
export class ConsoleAuditSink implements AuditSink {
  emit(event: AuditEvent): void {
    console.warn(`[audit] ${JSON.stringify(event)}`);
  }
}
