// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import { describe, expect, it, vi } from 'vitest';
import { CompositeDataResolver } from '../src/composite.js';
import { MockDataResolver } from '../src/mock.js';

describe('CompositeDataResolver', () => {
  it('returns the first non-undefined value from the chain', async () => {
    const a = vi.fn().mockReturnValue(undefined);
    const b = vi.fn().mockReturnValue('B');
    const c = vi.fn().mockReturnValue('C');
    const composite = new CompositeDataResolver([a, b, c]);
    expect(await composite.resolve({ source: 'x' })).toBe('B');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
  });

  it('treats null as a value (does not fall through)', async () => {
    const a = vi.fn().mockReturnValue(null);
    const b = vi.fn().mockReturnValue('B');
    const composite = new CompositeDataResolver([a, b]);
    expect(await composite.resolve({ source: 'x' })).toBeNull();
    expect(b).not.toHaveBeenCalled();
  });

  it('returns undefined when every resolver returns undefined', async () => {
    const composite = new CompositeDataResolver([() => undefined, () => undefined]);
    expect(await composite.resolve({ source: 'x' })).toBeUndefined();
  });

  it('rethrows resolver errors (does not silently fall through)', async () => {
    const composite = new CompositeDataResolver([
      () => {
        throw new Error('boom');
      },
      () => 'never',
    ]);
    await expect(composite.resolve({ source: 'x' })).rejects.toThrow(/boom/u);
  });

  it('skips children whose predicate returns false', async () => {
    const a = vi.fn().mockReturnValue('A');
    const b = vi.fn().mockReturnValue('B');
    const composite = new CompositeDataResolver([a, b], {
      predicates: [
        (binding) => binding.source === 'a-only',
        (binding) => binding.source === 'b-only',
      ],
    });
    expect(await composite.resolve({ source: 'b-only' })).toBe('B');
    expect(a).not.toHaveBeenCalled();
  });

  it('throws when constructed with an empty resolver list', () => {
    expect(() => new CompositeDataResolver([])).toThrow(/at least one/u);
  });

  it('end-to-end: Mock for one capability, fallback for another', async () => {
    const mock = new MockDataResolver({
      fixtures: { 'github.repo.list': [{ id: 1, name: 'cir' }] },
    });
    const fallback = vi.fn().mockReturnValue('rest-result');
    const composite = new CompositeDataResolver([mock.resolve, fallback]);
    expect(await composite.resolve({ source: 'github.repo.list' })).toEqual([
      { id: 1, name: 'cir' },
    ]);
    expect(fallback).not.toHaveBeenCalled();
    expect(await composite.resolve({ source: 'something.else' })).toBe('rest-result');
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
