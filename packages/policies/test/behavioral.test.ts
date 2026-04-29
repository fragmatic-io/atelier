import { describe, expect, it } from 'vitest';
import {
  NoopBehavioralDetector,
  type BehavioralPatternDetector,
  type DetectedPattern,
  type ObservedAction,
} from '../src/behavioral/detector.ts';

describe('NoopBehavioralDetector', () => {
  it('observe + reset are no-ops and do not throw', () => {
    const action: ObservedAction = {
      user_id: 'vid',
      app_id: 'mail.example.com',
      capability_id: 'thread.archive',
      args_fingerprint: 'a'.repeat(16),
      occurred_at: '2026-04-29T12:00:00Z',
    };
    expect(() => NoopBehavioralDetector.observe(action)).not.toThrow();
    expect(() => NoopBehavioralDetector.reset()).not.toThrow();
  });

  it('snapshot returns an empty array', () => {
    expect(NoopBehavioralDetector.snapshot()).toEqual([]);
  });

  it('toTrigger throws — there are never patterns to convert', () => {
    const fakePattern: DetectedPattern = {
      pattern_id: 'x',
      description: 'x',
      occurrences: 1,
    };
    expect(() => NoopBehavioralDetector.toTrigger(fakePattern)).toThrow(/NoopBehavioralDetector/);
  });
});

describe('BehavioralPatternDetector contract', () => {
  it('compiles structurally for a tiny in-memory implementation', () => {
    const seen: ObservedAction[] = [];
    const detector: BehavioralPatternDetector = {
      observe(a) {
        seen.push(a);
      },
      snapshot() {
        return [
          {
            pattern_id: 'p1',
            description: 'thread → task workaround',
            occurrences: seen.length,
            proposed_capability: 'task.create_from_thread',
            proposed_recompile: ['/today'],
          },
        ];
      },
      toTrigger(pattern) {
        return {
          type: 'behavior.workaround_detected',
          user_id: 'vid',
          app_id: 'mail.example.com',
          pattern: pattern.pattern_id,
          occurrences: pattern.occurrences,
          // proposed_capability / proposed_recompile are optional, but if
          // we set them on the pattern, propagate.
          ...(pattern.proposed_capability
            ? { proposed_capability: pattern.proposed_capability }
            : {}),
          ...(pattern.proposed_recompile ? { proposed_recompile: pattern.proposed_recompile } : {}),
        };
      },
      reset() {
        seen.length = 0;
      },
    };

    detector.observe({
      user_id: 'vid',
      app_id: 'mail.example.com',
      capability_id: 'thread.archive',
      args_fingerprint: 'a'.repeat(16),
      occurred_at: '2026-04-29T12:00:00Z',
    });
    const snap = detector.snapshot();
    expect(snap).toHaveLength(1);
    const pattern = snap[0]!;
    expect(pattern.occurrences).toBe(1);

    const trigger = detector.toTrigger(pattern);
    expect(trigger.type).toBe('behavior.workaround_detected');

    detector.reset();
    expect(detector.snapshot()[0]?.occurrences).toBe(0);
  });
});
