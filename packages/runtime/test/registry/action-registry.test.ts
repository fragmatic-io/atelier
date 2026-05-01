import { describe, expect, it } from 'vitest';
import { MapActionRegistry } from '../../src/registry/action-registry.js';

describe('MapActionRegistry', () => {
  it('register/has/get round-trips', () => {
    const reg = new MapActionRegistry();
    expect(reg.has('thread.archive')).toBe(false);
    const handler = (): Promise<unknown> => Promise.resolve({ archived_at: 'now' });
    reg.register('thread.archive', handler);
    expect(reg.has('thread.archive')).toBe(true);
    expect(reg.get('thread.archive')).toBe(handler);
  });

  it('register overwrites existing handler (last write wins)', () => {
    const reg = new MapActionRegistry();
    const a = (): Promise<unknown> => Promise.resolve('a');
    const b = (): Promise<unknown> => Promise.resolve('b');
    reg.register('thread.archive', a);
    reg.register('thread.archive', b);
    expect(reg.get('thread.archive')).toBe(b);
  });

  it('get returns undefined for unknown ids', () => {
    const reg = new MapActionRegistry();
    expect(reg.get('nope')).toBeUndefined();
  });
});
