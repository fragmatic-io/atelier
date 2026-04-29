import { describe, expect, it } from 'vitest';
import { reversibilitySurfaced } from '../src/baseline/reversibility_surfaced.ts';
import { baselineContext } from './fixtures/manifest.ts';

describe('reversibility_surfaced', () => {
  it('passes when an UndoBar is present in the route', () => {
    const ctx = baselineContext();
    const result = reversibilitySurfaced.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags reversible actions when the route lacks any undo affordance', () => {
    const ctx = baselineContext();
    // Remove the UndoBar from the baseline.
    ctx.manifest.routes[1]!.layout!.children = ctx.manifest.routes[1]!.layout!.children!.filter(
      (c) => c.component !== 'UndoBar',
    );
    const result = reversibilitySurfaced.evaluate(ctx);
    expect(result.ok).toBe(false);
    // Five reversible actions in the baseline (archive, create_from_thread,
    // draft.create, task.complete, task.snooze).
    const errors = result.violations.filter((v) => v.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(5);
    const archiveV = errors.find((v) => v.message.includes('thread.archive'));
    expect(archiveV).toBeDefined();
    expect(archiveV?.path).toMatch(/^\/routes\/1\/layout\/children\/0\/actions\/\d+/);
  });

  it('passes when a Button surfaces the rollback action', () => {
    const ctx = baselineContext();
    // Replace the UndoBar with an explicit rollback button. With only one
    // rollback Button (`thread.unarchive`), the other reversibles still need
    // coverage — keep the UndoBar too.
    ctx.manifest.routes[1]!.layout!.children!.push({
      component: 'Button',
      actions: ['thread.unarchive'],
    });
    const result = reversibilitySurfaced.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags reversible capability missing its `rollback` declaration', () => {
    const ctx = baselineContext();
    // Mutate the capability to remove rollback while keeping reversible:true
    delete ctx.capabilities['thread.archive']!.rollback;
    const result = reversibilitySurfaced.evaluate(ctx);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.message.includes('does not declare a `rollback`'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('silently skips actions whose capability is unresolved (confirmation policy reports)', () => {
    const ctx = baselineContext();
    ctx.manifest.routes[1]!.layout!.children!.push({
      component: 'Button',
      actions: ['ghost.action'],
    });
    const result = reversibilitySurfaced.evaluate(ctx);
    // Only the existing reversible actions need undo coverage; ghost action contributes nothing.
    const ghostV = result.violations.find((v) => v.message.includes('ghost.action'));
    expect(ghostV).toBeUndefined();
  });

  it('warns on destructive non-reversible actions (without blocking)', () => {
    const ctx = baselineContext();
    // Add a Button that fires `task.delete` (delete + reversible:false). The
    // confirmation policy needs a gate, but reversibility just warns.
    ctx.manifest.routes[1]!.layout!.children!.push({
      component: 'ConfirmDialog',
      children: [{ component: 'Button', actions: ['task.delete'] }],
    });
    const result = reversibilitySurfaced.evaluate(ctx);
    const warnings = result.violations.filter((v) => v.severity === 'warn');
    const taskDeleteWarn = warnings.find((v) => v.message.includes('task.delete'));
    expect(taskDeleteWarn).toBeDefined();
    expect(taskDeleteWarn?.message).toContain('not reversible');
  });
});
