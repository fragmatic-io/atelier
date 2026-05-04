import { describe, expect, it } from 'vitest';
import {
  actionSlotsFromBindings,
  compositionRolesFromBindings,
  EMPTY_REGISTRY,
  manifestContractsFromBindings,
  MapComponentRegistry,
  requiresExplicitStateSlotsFromBindings,
  type ComponentBinding,
} from '../../src/registry/component-registry.js';

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

  it('round-trips an optional compositionRole on a binding', () => {
    // The host opts a custom binding into the policy engine's
    // List/Grid/Table allow-list by setting `compositionRole` — the runtime
    // itself does not interpret the field; it just preserves it on the
    // binding so the host can collect them into a `composition_roles` map
    // when invoking `validateManifest`.
    const grid: ComponentBinding = {
      id: 'ProductGrid',
      factory: () => 'grid',
      compositionRole: 'grid',
    };
    const reg = new MapComponentRegistry({ ProductGrid: grid });
    expect(reg.get('ProductGrid')?.compositionRole).toBe('grid');
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

describe('requiresExplicitStateSlotsFromBindings', () => {
  it('returns the set of binding ids that opt into the strict state-slot check', () => {
    const bindings: Record<string, ComponentBinding> = {
      IssueQueue: { id: 'IssueQueue', factory: 1, requiresExplicitStateSlots: true },
      RepoTable: { id: 'RepoTable', factory: 2, requiresExplicitStateSlots: false },
      Logo: { id: 'Logo', factory: 3 },
    };
    const out = requiresExplicitStateSlotsFromBindings(bindings);
    expect(out.has('IssueQueue')).toBe(true);
    expect(out.has('RepoTable')).toBe(false);
    expect(out.has('Logo')).toBe(false);
    expect(out.size).toBe(1);
  });

  it('returns an empty set when no binding opts in', () => {
    expect(requiresExplicitStateSlotsFromBindings({}).size).toBe(0);
    expect(requiresExplicitStateSlotsFromBindings({ Logo: { id: 'Logo', factory: 1 } }).size).toBe(
      0,
    );
  });
});

describe('actionSlotsFromBindings', () => {
  it('extracts the actionSlots array for each binding that declares it', () => {
    const bindings: Record<string, ComponentBinding> = {
      ActionBar: {
        id: 'ActionBar',
        factory: 1,
        actionSlots: ['onPrimary', 'onSecondary'],
      },
      // Empty array is still meaningful — explicit "no actions allowed".
      Logo: { id: 'Logo', factory: 2, actionSlots: [] },
      // No declaration at all → omitted.
      Wordmark: { id: 'Wordmark', factory: 3 },
    };
    const out = actionSlotsFromBindings(bindings);
    expect(out.ActionBar).toEqual(['onPrimary', 'onSecondary']);
    expect(out.Logo).toEqual([]);
    expect('Wordmark' in out).toBe(false);
  });

  it('returns an empty record when no binding declares actionSlots', () => {
    expect(actionSlotsFromBindings({})).toEqual({});
    expect(actionSlotsFromBindings({ Logo: { id: 'Logo', factory: 1 } })).toEqual({});
  });
});

describe('manifestContractsFromBindings', () => {
  it('extracts the manifestContract for bindings that declare one', () => {
    const bindings: Record<string, ComponentBinding> = {
      Logo: {
        id: 'Logo',
        factory: 1,
        manifestContract: {
          allowed_props: ['src', 'alt'],
          required_props: ['src'],
          allowed_action_slots: [],
        },
      },
      Plain: { id: 'Plain', factory: 2 },
    };
    const out = manifestContractsFromBindings(bindings);
    expect(out.Logo?.required_props).toEqual(['src']);
    expect('Plain' in out).toBe(false);
  });
});
