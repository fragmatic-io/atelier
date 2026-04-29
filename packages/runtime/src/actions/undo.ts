// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Bounded LRU undo stack.
 *
 * Every reversible action the dispatcher executes pushes an `UndoEntry`.
 * `pop()` returns the most-recent entry; `dispatcher.undo()` then dispatches
 * the entry's `rollback` capability with the recorded inverse args.
 *
 * "Bounded LRU" here means: when the stack exceeds `maxSize`, we drop the
 * OLDEST entry (FIFO eviction). Top-of-stack is always the most recently
 * pushed; popping returns that. ETHOS principle 8 — reversibility is a
 * primitive — motivates the bounded behavior: lose the oldest history first,
 * never the most recent.
 */

const DEFAULT_MAX_SIZE = 50;

export interface UndoEntry {
  /** Capability ID to dispatch on undo (the rollback capability). */
  rollback_capability_id: string;
  /** Args to pass to the rollback capability. */
  rollback_input: unknown;
  /** Original capability + input, kept for audit/debugging. */
  original_capability_id: string;
  original_input: unknown;
  /** ISO 8601 timestamp the entry was pushed. */
  pushed_at: string;
}

export class UndoStack {
  readonly #entries: UndoEntry[] = [];
  readonly #maxSize: number;

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    if (maxSize < 1) {
      throw new Error(`UndoStack maxSize must be >= 1 (got ${String(maxSize)})`);
    }
    this.#maxSize = maxSize;
  }

  push(entry: UndoEntry): void {
    this.#entries.push(entry);
    while (this.#entries.length > this.#maxSize) {
      this.#entries.shift();
    }
  }

  pop(): UndoEntry | undefined {
    return this.#entries.pop();
  }

  /** Top of stack, or undefined if empty. */
  peek(): UndoEntry | undefined {
    return this.#entries[this.#entries.length - 1];
  }

  size(): number {
    return this.#entries.length;
  }

  isEmpty(): boolean {
    return this.#entries.length === 0;
  }

  clear(): void {
    this.#entries.length = 0;
  }

  /** Snapshot the entries for inspection (test-only, never mutate). */
  snapshot(): readonly UndoEntry[] {
    return [...this.#entries];
  }
}
