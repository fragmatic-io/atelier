// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `BehavioralTap` — adapter that subscribes to a `StreamingAuditSink` and
 * forwards each `action.executed` event to a `BehavioralPatternDetector`.
 *
 * The runtime opts in:
 *
 * ```ts
 * const detector = new SequenceDetector();
 * const tap = new BehavioralTap({ sink: streamingAudit, detector });
 * tap.start();
 * // ...later
 * detector.snapshot();
 * tap.stop();
 * ```
 *
 * The tap is a thin event mapper. It is NOT responsible for deciding when
 * to emit triggers, when to recompile, or when to surface a graduation
 * candidate — those decisions are downstream of `detector.snapshot()`.
 *
 * Privacy note: the tap synthesises an `args_fingerprint` from the audit
 * event id, which is itself a server-issued opaque token and never the
 * raw action input. No raw inputs are ever observed or persisted.
 *
 * Out of scope here (V-6 territory): batching, rate-limiting, multi-tenant
 * isolation, persisting detector state across process restarts.
 */

import type { AuditEvent } from '@atelier/schemas';
import type { BehavioralPatternDetector, ObservedAction } from '@atelier/policies';
import type { StreamingAuditSink } from './streaming.js';

/** Prefix used in audit `trigger_chain` entries to mark capability ids. */
const ACTION_PREFIX = 'action:';

export interface BehavioralTapOptions {
  /** The audit sink to subscribe to. */
  sink: StreamingAuditSink;
  /** The detector that will receive `ObservedAction`s. */
  detector: BehavioralPatternDetector;
  /**
   * Optional event-type filter. Defaults to `'action.executed'` only —
   * `action.denied` is intentionally excluded because a denied action is
   * not a workflow step.
   */
  eventTypes?: ReadonlyArray<AuditEvent['type']>;
  /**
   * Optional hook for tests/observability. Called with every
   * `ObservedAction` the tap forwards. Errors thrown here are swallowed
   * so a misbehaving observer can't poison the detector.
   */
  onObserve?: (action: ObservedAction) => void;
}

/**
 * Extracts the capability id from an `action.executed` audit event.
 * The dispatcher records it as `action:<capability.id>` in `trigger_chain`.
 */
export function capabilityIdFromAuditEvent(event: AuditEvent): string | undefined {
  for (const entry of event.trigger_chain) {
    if (entry.startsWith(ACTION_PREFIX)) return entry.slice(ACTION_PREFIX.length);
  }
  return undefined;
}

/**
 * Maps an audit event to an `ObservedAction`. Returns `undefined` if the
 * event is not an action event or the capability id cannot be recovered.
 */
export function auditEventToObservedAction(
  event: AuditEvent,
  allowedTypes: ReadonlySet<AuditEvent['type']>,
): ObservedAction | undefined {
  if (!allowedTypes.has(event.type)) return undefined;
  const capability_id = capabilityIdFromAuditEvent(event);
  if (!capability_id) return undefined;
  return {
    user_id: event.user_id,
    app_id: event.app_id,
    capability_id,
    // The audit event_id is a server-issued opaque id, never the raw input.
    // Using it as the args_fingerprint preserves the privacy contract while
    // giving each observation a stable per-event identifier.
    args_fingerprint: event.event_id,
    occurred_at: event.timestamp,
    ...(event.manifest_id ? { manifest_id: event.manifest_id } : {}),
  };
}

export class BehavioralTap {
  readonly #sink: StreamingAuditSink;
  readonly #detector: BehavioralPatternDetector;
  readonly #allowedTypes: ReadonlySet<AuditEvent['type']>;
  readonly #onObserve: ((action: ObservedAction) => void) | undefined;
  #unsubscribe: (() => void) | undefined;

  constructor(opts: BehavioralTapOptions) {
    this.#sink = opts.sink;
    this.#detector = opts.detector;
    this.#allowedTypes = new Set(opts.eventTypes ?? (['action.executed'] as const));
    this.#onObserve = opts.onObserve;
  }

  /**
   * Subscribe to the sink. Idempotent — a second `start()` is a no-op.
   * Returns the unsubscribe function for symmetry with the sink API.
   */
  start(): () => void {
    if (this.#unsubscribe) return this.#unsubscribe;
    this.#unsubscribe = this.#sink.subscribe((event) => this.#handle(event));
    return this.#unsubscribe;
  }

  /** Cancel the subscription. Idempotent. */
  stop(): void {
    if (!this.#unsubscribe) return;
    this.#unsubscribe();
    this.#unsubscribe = undefined;
  }

  /** True if currently subscribed. */
  isRunning(): boolean {
    return Boolean(this.#unsubscribe);
  }

  #handle(event: AuditEvent): void {
    const observed = auditEventToObservedAction(event, this.#allowedTypes);
    if (!observed) return;
    try {
      this.#detector.observe(observed);
    } catch {
      // A misbehaving detector can't poison the audit bus.
    }
    if (this.#onObserve) {
      try {
        this.#onObserve(observed);
      } catch {
        // Observer errors must not break the tap.
      }
    }
  }
}
