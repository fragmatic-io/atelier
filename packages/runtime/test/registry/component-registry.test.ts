import { describe, expect, it } from 'vitest';
import {
  compositionRolesFromBindings,
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

describe('compositionRolesFromBindings', () => {
  it('extracts the role for every binding that declares one', () => {
    const bindings: Record<string, ComponentBinding> = {
      IssueQueue: { id: 'IssueQueue', factory: 1, compositionRole: 'list' },
      RepoTable: { id: 'RepoTable', factory: 2, compositionRole: 'table' },
      Wordmark: { id: 'Wordmark', factory: 3 }, // no role
    };
    expect(compositionRolesFromBindings(bindings)).toEqual({
      IssueQueue: 'list',
      RepoTable: 'table',
    });
  });

  it('returns an empty record when no bindings declare roles', () => {
    expect(compositionRolesFromBindings({})).toEqual({});
    expect(
      compositionRolesFromBindings({
        Card: { id: 'Card', factory: 1 },
      }),
    ).toEqual({});
  });
});
