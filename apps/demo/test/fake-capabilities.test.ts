// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Wave 11 / Int-8 — assert Aurora's destructive capabilities carry the
 * `undoable: true` flag and that the matching rollback capabilities exist.
 * These are the inputs the `withUndo()` middleware reads at dispatch time;
 * a regression that drops the flag silently disables the undo toast.
 */
import { describe, expect, it } from 'vitest';
import { CapabilitySchema, type Capability } from '@cir/schemas';
import { CAPABILITIES } from '../lib/fake-capabilities.js';
import { UNDO_TOAST_AMBIENT_SATISFIER } from '@cir/policies';

describe('Aurora — fake-capabilities undoable flags', () => {
  it.each(['thread.archive', 'task.complete', 'task.snooze', 'task.create_from_thread'])(
    '%s is undoable with a 5s window and a defined rollback',
    (id) => {
      const cap = CAPABILITIES[id] as Capability | undefined;
      expect(cap, `capability ${id} missing`).toBeDefined();
      expect(cap!.undoable).toBe(true);
      expect(cap!.undo_window_ms).toBe(5000);
      expect(cap!.reversible).toBe(true);
      expect(cap!.rollback).toBeDefined();
      // Rollback target must itself exist and be valid.
      const rollback = CAPABILITIES[cap!.rollback!];
      expect(rollback, `rollback ${cap!.rollback ?? '?'} not registered`).toBeDefined();
    },
  );

  it('every CAPABILITIES entry parses against CapabilitySchema', () => {
    for (const [id, cap] of Object.entries(CAPABILITIES)) {
      const result = CapabilitySchema.safeParse(cap);
      expect(result.success, `capability ${id} failed schema parse`).toBe(true);
    }
  });

  it('the UNDO_TOAST_AMBIENT_SATISFIER still covers reversibility_surfaced', () => {
    expect(UNDO_TOAST_AMBIENT_SATISFIER.policyId).toBe('reversibility_surfaced');
    expect(UNDO_TOAST_AMBIENT_SATISFIER.satisfies).toBe('all');
  });
});
