import { describe, expect, it } from 'vitest';
import { ALWAYS_CONFIRM, ALWAYS_DECLINE, requiresConfirmation } from '../../src/actions/confirm.ts';

describe('requiresConfirmation', () => {
  it('returns true for modal and verbal_required', () => {
    expect(requiresConfirmation('modal')).toBe(true);
    expect(requiresConfirmation('verbal_required')).toBe(true);
  });
  it('returns false for none and inline', () => {
    expect(requiresConfirmation('none')).toBe(false);
    expect(requiresConfirmation('inline')).toBe(false);
  });
});

describe('ALWAYS_CONFIRM / ALWAYS_DECLINE', () => {
  it('ALWAYS_CONFIRM resolves confirmed:true', async () => {
    const decision = await ALWAYS_CONFIRM({
      capability: { id: 'x' } as never,
      level: 'modal',
      input: {},
      ctx: { user_id: 'u', app_id: 'a' },
    });
    expect(decision.confirmed).toBe(true);
  });

  it('ALWAYS_DECLINE resolves confirmed:false with reason', async () => {
    const decision = await ALWAYS_DECLINE({
      capability: { id: 'x' } as never,
      level: 'modal',
      input: {},
      ctx: { user_id: 'u', app_id: 'a' },
    });
    expect(decision.confirmed).toBe(false);
    expect(decision.reason).toBe('declined-by-test');
  });
});
