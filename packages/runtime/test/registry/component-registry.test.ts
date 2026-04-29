import { describe, expect, it } from 'vitest';
import {
  EMPTY_REGISTRY,
  MapComponentRegistry,
  type ComponentBinding,
} from '../../src/registry/component-registry.ts';

describe('EMPTY_REGISTRY', () => {
  it('reports no components', () => {
    expect(EMPTY_REGISTRY.has('Stack')).toBe(false);
    expect(EMPTY_REGISTRY.get('Stack')).toBeUndefined();
    expect(EMPTY_REGISTRY.list()).toEqual([]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(EMPTY_REGISTRY)).toBe(true);
  });
});

describe('MapComponentRegistry', () => {
  it('starts empty by default', () => {
    const reg = new MapComponentRegistry();
    expect(reg.list()).toEqual([]);
  });

  it('seeds from initial bindings', () => {
    const stackBinding: ComponentBinding = { id: 'Stack', factory: () => 'stack' };
    const reg = new MapComponentRegistry({ Stack: stackBinding });
    expect(reg.has('Stack')).toBe(true);
    expect(reg.get('Stack')).toBe(stackBinding);
    expect(reg.list()).toEqual(['Stack']);
  });

  it('register adds new bindings and chains', () => {
    const reg = new MapComponentRegistry();
    const card: ComponentBinding = { id: 'Card', factory: 1 };
    expect(reg.register(card)).toBe(reg);
    expect(reg.has('Card')).toBe(true);
  });

  it('register overwrites existing bindings', () => {
    const reg = new MapComponentRegistry();
    reg.register({ id: 'Card', factory: 1 });
    reg.register({ id: 'Card', factory: 2 });
    expect(reg.get('Card')?.factory).toBe(2);
    expect(reg.list()).toHaveLength(1);
  });
});
