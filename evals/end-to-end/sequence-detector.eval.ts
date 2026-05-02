// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * End-to-end eval: replay a fixture audit log of 100 actions through the
 * `BehavioralTap` adapter and assert the expected graduation candidates
 * surface.
 *
 * Deterministic; no network, no Gemini. The fixture stream is generated
 * from a tiny seeded LCG (Lehmer) so the output is bit-identical across
 * runs / OSes.
 */

import { defineEval } from '@atelier/evals';
import { SequenceDetector } from '@atelier/policies';
import { BehavioralTap, StreamingAuditSink } from '@atelier/runtime';
import type { AuditEvent } from '@atelier/schemas';

interface DetectorOutcome {
  total_observations: number;
  pattern_count: number;
  top_pattern_capabilities: readonly string[];
  top_pattern_occurrences: number;
  // True if all detected patterns have ≥ 2 distinct users (cross-user
  // graduation candidates only — no per-user habits).
  all_cross_user: boolean;
  // True if the (b, c) sequence surfaces — the canonical graduation
  // candidate baked into the fixture stream.
  surfaces_b_then_c: boolean;
}

/**
 * Lehmer LCG. Pure, deterministic. Used to permute the fixture stream so
 * it doesn't read like a contrived demo, but stays reproducible.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Generate a 100-event fixture stream:
 *  - 3 users (u1, u2, u3) each repeatedly run the (b, c) workaround.
 *  - 1 user (u_solo) repeatedly runs (x, y) but never with anyone else
 *    — should NOT surface (single-user habit).
 *  - The remainder is filler noise drawn from a small capability set.
 *
 * Each event lands as an `action.executed` audit event so the
 * `BehavioralTap` mapping path is exercised.
 */
function fixtureStream(): AuditEvent[] {
  const rand = lcg(42);
  const events: AuditEvent[] = [];
  const filler = ['inbox.refresh', 'thread.open', 'thread.archive'];
  const users = ['u1', 'u2', 'u3'];
  let i = 0;
  const push = (user_id: string, capability_id: string): void => {
    i += 1;
    events.push({
      event_id: `evt_${i.toString().padStart(4, '0')}`,
      timestamp: `2026-04-30T12:${Math.floor(i / 60)
        .toString()
        .padStart(2, '0')}:${(i % 60).toString().padStart(2, '0')}.000Z`,
      user_id,
      app_id: 'cir.demo',
      type: 'action.executed',
      actor: 'user',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [`action:${capability_id}`],
      token_cost: 0,
      policy_evaluations: [],
    });
  };

  // 30 (b, c) pairs split across 3 users → 60 events, all cross-user.
  for (let n = 0; n < 30; n += 1) {
    const u = users[n % users.length]!;
    push(u, 'b');
    push(u, 'c');
  }
  // 8 (x, y) pairs by a single user → 16 events, must NOT surface.
  for (let n = 0; n < 8; n += 1) {
    push('u_solo', 'x');
    push('u_solo', 'y');
  }
  // 24 filler events sprinkled across users.
  for (let n = 0; n < 24; n += 1) {
    const u = users[Math.floor(rand() * users.length)]!;
    const cap = filler[Math.floor(rand() * filler.length)]!;
    push(u, cap);
  }
  return events;
}

export function runSequenceDetectorEval(): DetectorOutcome {
  const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 3 });
  const sink = new StreamingAuditSink({ bufferSize: 1000 });
  const tap = new BehavioralTap({ sink, detector });
  tap.start();

  const events = fixtureStream();
  for (const e of events) sink.emit(e);

  const patterns = detector.snapshot();
  let allCross = true;
  for (const p of patterns) {
    const users = detector.perUserCounts(p.pattern_id);
    if (users.size < 2) {
      allCross = false;
      break;
    }
  }
  const top = patterns[0];
  // The canonical (b, c) pair must surface.
  const bcHash = patterns.find((p) => {
    const caps = detector.capabilitiesFor(p.pattern_id);
    return caps.length === 2 && caps[0] === 'b' && caps[1] === 'c';
  });
  return {
    total_observations: events.length,
    pattern_count: patterns.length,
    top_pattern_capabilities: top ? detector.capabilitiesFor(top.pattern_id) : [],
    top_pattern_occurrences: top?.occurrences ?? 0,
    all_cross_user: allCross,
    surfaces_b_then_c: Boolean(bcHash),
  };
}

interface NoInput {
  /** Marker — kept so `defineEval` doesn't treat the input as an empty object. */
  fixture: 'sequence-detector-100';
}

export default defineEval({
  id: 'end-to-end/sequence-detector/replay-100-actions',
  description:
    'Replay a 100-event fixture audit log through BehavioralTap → SequenceDetector and assert the expected graduation candidate surfaces, deterministically, offline.',
  kind: 'end-to-end',
  tags: ['behavioral', 'sequence-detector', 'offline'],
  input: { fixture: 'sequence-detector-100' } satisfies NoInput,
  run: runSequenceDetectorEval,
  expected: (output: unknown): boolean => {
    const o = output as DetectorOutcome;
    return (
      o.total_observations === 100 &&
      o.pattern_count >= 1 &&
      o.surfaces_b_then_c === true &&
      o.all_cross_user === true &&
      o.top_pattern_capabilities[0] === 'b' &&
      o.top_pattern_capabilities[1] === 'c' &&
      o.top_pattern_occurrences >= 30
    );
  },
});
