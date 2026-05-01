import { describe, expect, it } from 'vitest';
import { UndoStack, type UndoEntry } from '../../src/actions/undo.js';

function entry(label: string): UndoEntry {
  return {
    rollback_capability_id: `${label}.rollback`,
    rollback_input: { id: label },
    original_capability_id: label,
    original_input: { id: label },
    ctx: { user_id: 'test-user', app_id: 'test-app' },
    pushed_at: '2026-04-29T12:00:00Z',
  };
}

describe('UndoStack', () => {
  it('pop returns last-pushed (LIFO)', () => {
    const s = new UndoStack(10);
    s.push(entry('a'));
    s.push(entry('b'));
    expect(s.pop()?.original_capability_id).toBe('b');
    expect(s.pop()?.original_capability_id).toBe('a');
    expect(s.pop()).toBeUndefined();
  });

  it('peek does not mutate', () => {
    const s = new UndoStack(10);
    s.push(entry('a'));
    expect(s.peek()?.original_capability_id).toBe('a');
    expect(s.size()).toBe(1);
  });

  it('isEmpty / size reflect state', () => {
    const s = new UndoStack(2);
    expect(s.isEmpty()).toBe(true);
    s.push(entry('a'));
    expect(s.isEmpty()).toBe(false);
    expect(s.size()).toBe(1);
  });

  it('drops oldest when over capacity', () => {
    const s = new UndoStack(2);
    s.push(entry('a'));
    s.push(entry('b'));
    s.push(entry('c'));
    expect(s.size()).toBe(2);
    expect(s.snapshot().map((e) => e.original_capability_id)).toEqual(['b', 'c']);
    expect(s.pop()?.original_capability_id).toBe('c');
    expect(s.pop()?.original_capability_id).toBe('b');
    expect(s.pop()).toBeUndefined();
  });

  it('clear empties the stack', () => {
    const s = new UndoStack(10);
    s.push(entry('a'));
    s.push(entry('b'));
    s.clear();
    expect(s.size()).toBe(0);
  });

  it('snapshot is a copy', () => {
    const s = new UndoStack(10);
    s.push(entry('a'));
    const snap = s.snapshot();
    s.push(entry('b'));
    expect(snap).toHaveLength(1);
  });

  it('rejects maxSize < 1', () => {
    expect(() => new UndoStack(0)).toThrow();
    expect(() => new UndoStack(-1)).toThrow();
  });
});
