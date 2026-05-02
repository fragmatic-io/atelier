// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the `BehavioralTap` adapter — wires `StreamingAuditSink`
 * `action.executed` events into a `BehavioralPatternDetector.observe()`.
 *
 * The adapter is intentionally tiny; these tests cover:
 *  - mapping `action.executed` → `ObservedAction`,
 *  - filtering out non-action events (action.denied, manifest.served, ...),
 *  - graceful handling of missing capability id,
 *  - subscribe/unsubscribe lifecycle,
 *  - detector errors don't poison the bus.
 */

import { describe, expect, it } from 'vitest';
import type { BehavioralPatternDetector, DetectedPattern, ObservedAction } from '@atelier/policies';
import type { AuditEvent, Trigger } from '@atelier/schemas';
import { StreamingAuditSink } from '../../src/audit/streaming.js';
import {
  BehavioralTap,
  auditEventToObservedAction,
  capabilityIdFromAuditEvent,
} from '../../src/audit/behavioral-tap.js';

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    event_id: 'evt_test_001',
    timestamp: '2026-04-30T12:00:00Z',
    user_id: 'vid',
    app_id: 'mail.example.com',
    type: 'action.executed',
    actor: 'user',
    before_state_hash: '',
    after_state_hash: '',
    trigger_chain: ['action:thread.archive'],
    token_cost: 0,
    policy_evaluations: [],
    ...overrides,
  };
}

class RecordingDetector implements BehavioralPatternDetector {
  observed: ObservedAction[] = [];
  observe(action: ObservedAction): void {
    this.observed.push(action);
  }
  snapshot(): readonly DetectedPattern[] {
    return [];
  }
  toTrigger(): Trigger {
    throw new Error('not used in this test');
  }
  reset(): void {
    this.observed = [];
  }
}

describe('capabilityIdFromAuditEvent', () => {
  it('returns the id from a single-entry trigger_chain', () => {
    const event = makeEvent({ trigger_chain: ['action:thread.archive'] });
    expect(capabilityIdFromAuditEvent(event)).toBe('thread.archive');
  });

  it('returns the id from a multi-entry trigger_chain', () => {
    const event = makeEvent({
      trigger_chain: ['source:user_click', 'action:task.create', 'reason:reply_to_thread'],
    });
    expect(capabilityIdFromAuditEvent(event)).toBe('task.create');
  });

  it('returns undefined when no action: prefix is present', () => {
    const event = makeEvent({ trigger_chain: ['source:user_click'] });
    expect(capabilityIdFromAuditEvent(event)).toBeUndefined();
  });
});

describe('auditEventToObservedAction', () => {
  const allowed = new Set<AuditEvent['type']>(['action.executed']);

  it('maps an action.executed event to an ObservedAction', () => {
    const action = auditEventToObservedAction(
      makeEvent({ trigger_chain: ['action:thread.archive'] }),
      allowed,
    );
    expect(action).toEqual({
      user_id: 'vid',
      app_id: 'mail.example.com',
      capability_id: 'thread.archive',
      args_fingerprint: 'evt_test_001',
      occurred_at: '2026-04-30T12:00:00Z',
    });
  });

  it('returns undefined for non-allowed event types', () => {
    const action = auditEventToObservedAction(makeEvent({ type: 'manifest.served' }), allowed);
    expect(action).toBeUndefined();
  });

  it('returns undefined when capability id cannot be recovered', () => {
    const action = auditEventToObservedAction(
      makeEvent({ trigger_chain: ['source:click'] }),
      allowed,
    );
    expect(action).toBeUndefined();
  });

  it('includes manifest_id when present', () => {
    const action = auditEventToObservedAction(makeEvent({ manifest_id: 'm_8f3a2b1c' }), allowed);
    expect(action?.manifest_id).toBe('m_8f3a2b1c');
  });
});

describe('BehavioralTap lifecycle', () => {
  it('forwards action.executed events while running', () => {
    const sink = new StreamingAuditSink();
    const detector = new RecordingDetector();
    const tap = new BehavioralTap({ sink, detector });
    tap.start();
    sink.emit(makeEvent({ trigger_chain: ['action:thread.archive'] }));
    sink.emit(makeEvent({ event_id: 'evt_002', trigger_chain: ['action:task.create'] }));
    expect(detector.observed.map((o) => o.capability_id)).toEqual([
      'thread.archive',
      'task.create',
    ]);
  });

  it('does not forward events of unrelated types', () => {
    const sink = new StreamingAuditSink();
    const detector = new RecordingDetector();
    new BehavioralTap({ sink, detector }).start();
    sink.emit(makeEvent({ type: 'manifest.served' }));
    sink.emit(makeEvent({ type: 'action.denied' }));
    expect(detector.observed).toEqual([]);
  });

  it('stops forwarding after stop() is called', () => {
    const sink = new StreamingAuditSink();
    const detector = new RecordingDetector();
    const tap = new BehavioralTap({ sink, detector });
    tap.start();
    sink.emit(makeEvent());
    tap.stop();
    sink.emit(makeEvent({ event_id: 'evt_002' }));
    expect(detector.observed).toHaveLength(1);
    expect(tap.isRunning()).toBe(false);
  });

  it('start() is idempotent; stop() is idempotent', () => {
    const sink = new StreamingAuditSink();
    const detector = new RecordingDetector();
    const tap = new BehavioralTap({ sink, detector });
    tap.start();
    tap.start(); // second call is a no-op
    sink.emit(makeEvent());
    expect(detector.observed).toHaveLength(1);
    tap.stop();
    tap.stop(); // does not throw
  });

  it('detector.observe() throwing does not break the audit bus', () => {
    const sink = new StreamingAuditSink();
    const detector: BehavioralPatternDetector = {
      observe() {
        throw new Error('detector exploded');
      },
      snapshot() {
        return [];
      },
      toTrigger() {
        throw new Error('n/a');
      },
      reset() {},
    };
    new BehavioralTap({ sink, detector }).start();
    expect(() => sink.emit(makeEvent())).not.toThrow();
  });

  it('onObserve callback is fired for every forwarded action', () => {
    const sink = new StreamingAuditSink();
    const detector = new RecordingDetector();
    const seen: string[] = [];
    new BehavioralTap({
      sink,
      detector,
      onObserve: (a) => seen.push(a.capability_id),
    }).start();
    sink.emit(makeEvent({ trigger_chain: ['action:a'] }));
    sink.emit(makeEvent({ event_id: 'evt_2', trigger_chain: ['action:b'] }));
    expect(seen).toEqual(['a', 'b']);
  });

  it('eventTypes option accepts custom event-type set', () => {
    const sink = new StreamingAuditSink();
    const detector = new RecordingDetector();
    new BehavioralTap({
      sink,
      detector,
      eventTypes: ['action.executed', 'action.denied'],
    }).start();
    sink.emit(makeEvent({ type: 'action.denied', trigger_chain: ['action:x', 'reason:no'] }));
    expect(detector.observed).toHaveLength(1);
    expect(detector.observed[0]?.capability_id).toBe('x');
  });
});
