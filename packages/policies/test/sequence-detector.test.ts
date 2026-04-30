// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `SequenceDetector` — the first real `BehavioralPatternDetector`
 * implementation. The detector keeps a per-user sliding window, hashes
 * sub-sequences, and surfaces patterns observed across multiple users.
 *
 * What we cover:
 *  - Threshold gating (single-user repetition does not surface).
 *  - Cross-user dedup (≥ 2 users required to surface).
 *  - Window eviction (an old sequence falls out once the window fills).
 *  - Sequence-length wiring (no length < 2; default `[2,3,4,5]`).
 *  - Hash determinism + non-collision with adjacent strings (`a` + `b` vs
 *    `ab`).
 *  - Trigger emission scopes correctly + throws for unknown patterns.
 *  - Reset clears all state.
 *  - Diagnostic helpers (`perUserCounts`, `capabilitiesFor`) for the demo
 *    admin route.
 */

import { describe, expect, it } from 'vitest';
import { SequenceDetector, type ObservedAction } from '../src/index.ts';
import { __sequenceDetectorInternals } from '../src/behavioral/sequence-detector.ts';

function obs(
  user_id: string,
  capability_id: string,
  i = 0,
  app_id = 'mail.example.com',
): ObservedAction {
  return {
    user_id,
    app_id,
    capability_id,
    args_fingerprint: `fp_${user_id}_${i.toString(36).padStart(2, '0')}`,
    occurred_at: `2026-04-30T12:00:${(i % 60).toString().padStart(2, '0')}Z`,
  };
}

function feed(detector: SequenceDetector, user: string, caps: string[]): void {
  caps.forEach((c, i) => detector.observe(obs(user, c, i)));
}

describe('SequenceDetector — algorithm correctness', () => {
  it('does not surface a pattern below threshold', () => {
    const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 3 });
    // Two users each do the pair once → total = 2, threshold = 3 → none.
    feed(detector, 'u1', ['a', 'b']);
    feed(detector, 'u2', ['a', 'b']);
    expect(detector.snapshot()).toEqual([]);
  });

  it('surfaces a pattern at threshold with ≥ 2 users', () => {
    const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 3 });
    feed(detector, 'u1', ['a', 'b', 'a', 'b']); // pair (a,b) hits twice
    feed(detector, 'u2', ['a', 'b']); // pair (a,b) hits once → total 3
    const patterns = detector.snapshot();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.occurrences).toBe(3);
    expect(patterns[0]?.description).toContain('2 users');
  });

  it('does NOT surface a single-user pattern even far above threshold', () => {
    const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 3 });
    feed(detector, 'solo', ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
    expect(detector.snapshot()).toEqual([]);
  });

  it('surfaces multiple patterns ordered by occurrences', () => {
    const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 2 });
    // (a,b) seen 4 times across two users; (c,d) seen 2 times across two users.
    feed(detector, 'u1', ['a', 'b', 'a', 'b', 'c', 'd']);
    feed(detector, 'u2', ['a', 'b', 'a', 'b', 'c', 'd']);
    const patterns = detector.snapshot();
    expect(patterns.length).toBeGreaterThanOrEqual(2);
    expect(patterns[0]!.occurrences).toBeGreaterThanOrEqual(patterns[1]!.occurrences);
  });

  it('honours configured sequenceLengths (length 3 only)', () => {
    const detector = new SequenceDetector({ sequenceLengths: [3], threshold: 2 });
    feed(detector, 'u1', ['a', 'b', 'c']);
    feed(detector, 'u2', ['a', 'b', 'c']);
    const patterns = detector.snapshot();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.proposed_recompile).toEqual([
      'capability:a',
      'capability:b',
      'capability:c',
    ]);
  });

  it('default sequence lengths are [2,3,4,5] — length 1 ignored', () => {
    // A run of identical actions could accidentally match length-1 if we
    // weren't filtering. Confirm we never report a 1-step sequence.
    const detector = new SequenceDetector({ threshold: 1 });
    feed(detector, 'u1', ['a', 'a', 'a']);
    feed(detector, 'u2', ['a', 'a', 'a']);
    const patterns = detector.snapshot();
    for (const p of patterns) {
      const caps = (p.proposed_recompile ?? []).length;
      expect(caps).toBeGreaterThanOrEqual(2);
      expect(caps).toBeLessThanOrEqual(5);
    }
  });
});

describe('SequenceDetector — window eviction', () => {
  it('evicts old observations once the window fills', () => {
    const detector = new SequenceDetector({
      windowSize: 2,
      sequenceLengths: [2],
      threshold: 1,
    });
    // window = ["a"], then ["a","b"], then ["b","c"] (a evicted).
    detector.observe(obs('u1', 'a', 0));
    detector.observe(obs('u1', 'b', 1));
    detector.observe(obs('u1', 'c', 2));
    detector.observe(obs('u2', 'b', 0));
    detector.observe(obs('u2', 'c', 1));
    // Pair (b,c) seen across two users → surfaces.
    const patterns = detector.snapshot();
    expect(patterns.length).toBe(1);
    expect(patterns[0]?.proposed_recompile).toEqual(['capability:b', 'capability:c']);
  });

  it('large window keeps long sequences alive', () => {
    const detector = new SequenceDetector({
      windowSize: 50,
      sequenceLengths: [4],
      threshold: 2,
    });
    feed(detector, 'u1', ['x', 'y', 'a', 'b', 'c', 'd']);
    feed(detector, 'u2', ['a', 'b', 'c', 'd']);
    const patterns = detector.snapshot();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.proposed_recompile?.length).toBe(4);
  });
});

describe('SequenceDetector — hash + collision safety', () => {
  it('hashes are deterministic', () => {
    const { hashSequence } = __sequenceDetectorInternals;
    expect(hashSequence(['a', 'b', 'c'])).toBe(hashSequence(['a', 'b', 'c']));
  });

  it('order-sensitive: [a,b] hashes differ from [b,a]', () => {
    const { hashSequence } = __sequenceDetectorInternals;
    expect(hashSequence(['a', 'b'])).not.toBe(hashSequence(['b', 'a']));
  });

  it('boundary-safe: ["a","b"] does not collide with ["ab"]', () => {
    const { hashSequence } = __sequenceDetectorInternals;
    expect(hashSequence(['a', 'b'])).not.toBe(hashSequence(['ab']));
  });

  it('boundary-safe: ["foo","bar"] does not collide with ["foobar"]', () => {
    const { hashSequence } = __sequenceDetectorInternals;
    expect(hashSequence(['foo', 'bar'])).not.toBe(hashSequence(['foobar']));
  });
});

describe('SequenceDetector — toTrigger', () => {
  it('emits a behavior.pattern_detected trigger scoped to last observer', () => {
    const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 2 });
    feed(detector, 'u1', ['a', 'b']);
    feed(detector, 'u2', ['a', 'b']);
    const [pattern] = detector.snapshot();
    const trigger = detector.toTrigger(pattern!);
    expect(trigger.type).toBe('behavior.pattern_detected');
    if (trigger.type === 'behavior.pattern_detected') {
      expect(trigger.user_id).toBe('u2');
      expect(trigger.pattern_id).toBe(pattern!.pattern_id);
      expect(trigger.occurrences).toBe(pattern!.occurrences);
      expect(trigger.distinct_users).toBe(2);
      expect(trigger.capability_ids).toEqual(['capability:a', 'capability:b']);
    }
  });

  it('throws for an unknown pattern id', () => {
    const detector = new SequenceDetector();
    expect(() =>
      detector.toTrigger({
        pattern_id: 'seq_doesnotexist',
        description: 'x',
        occurrences: 99,
      }),
    ).toThrow(/unknown pattern/);
  });
});

describe('SequenceDetector — reset + diagnostics', () => {
  it('reset clears all state', () => {
    const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 2 });
    feed(detector, 'u1', ['a', 'b']);
    feed(detector, 'u2', ['a', 'b']);
    expect(detector.snapshot().length).toBe(1);
    detector.reset();
    expect(detector.snapshot()).toEqual([]);
  });

  it('perUserCounts returns per-user breakdown for an active pattern', () => {
    const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 2 });
    feed(detector, 'u1', ['a', 'b', 'a', 'b']); // 2 hits
    feed(detector, 'u2', ['a', 'b']); // 1 hit
    const [pattern] = detector.snapshot();
    const counts = detector.perUserCounts(pattern!.pattern_id);
    expect(counts.get('u1')).toBe(2);
    expect(counts.get('u2')).toBe(1);
  });

  it('capabilitiesFor returns the pattern chain', () => {
    const detector = new SequenceDetector({ sequenceLengths: [3], threshold: 2 });
    feed(detector, 'u1', ['a', 'b', 'c']);
    feed(detector, 'u2', ['a', 'b', 'c']);
    const [pattern] = detector.snapshot();
    expect(detector.capabilitiesFor(pattern!.pattern_id)).toEqual(['a', 'b', 'c']);
  });
});

describe('SequenceDetector — option validation', () => {
  it('throws when sequenceLengths contains only invalid values', () => {
    expect(() => new SequenceDetector({ sequenceLengths: [1, 0, -1] })).toThrow(/sequenceLengths/);
  });

  it('clamps windowSize / threshold to >= 1', () => {
    const detector = new SequenceDetector({ windowSize: 0, threshold: 0, sequenceLengths: [2] });
    feed(detector, 'u1', ['a']);
    feed(detector, 'u2', ['a']);
    // windowSize clamped to 1 → length-2 sequence can never form → no patterns.
    expect(detector.snapshot()).toEqual([]);
  });

  it('uses injected `now` clock', () => {
    const detector = new SequenceDetector({ now: () => 12345 });
    expect(detector.now()).toBe(12345);
  });
});
