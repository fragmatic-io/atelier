// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `withHighSalienceEmphasis` — the Wave 7 / P-9 data-resolver
 * wrapper that auto-stamps `emphasis: 'high'` on rows for high-salience
 * bindings.
 */

import { describe, expect, it } from 'vitest';
import type { Capability, IntentProfile } from '@atelier/schemas';
import { withHighSalienceEmphasis } from '../src/salience.js';
import type { DataResolver } from '../src/types.js';

function cap(level: 'high' | 'normal' | 'low' | undefined, id: string): Capability {
  return {
    id,
    kind: 'data',
    version: '1.0.0',
    input: {},
    output: {},
    side_effects: [`reads:${id.split('.')[0] ?? 'x'}`],
    permissions: [`${id.split('.')[0] ?? 'x'}:read`],
    confirmation: 'none',
    reversible: true,
    ...(level !== undefined ? { salience_level: level } : {}),
  };
}

function fakeResolver<T>(value: T): DataResolver {
  // Return a settled promise so the wrapper still awaits it; an `async`
  // arrow with no `await` would trip `@typescript-eslint/require-await`.
  return () => Promise.resolve(value);
}

describe('withHighSalienceEmphasis', () => {
  it('stamps emphasis on every row of a high-salience array payload', async () => {
    const c = cap('high', 'github.issue.list');
    const wrapped = withHighSalienceEmphasis(
      fakeResolver([
        { id: 1, title: 'One' },
        { id: 2, title: 'Two' },
      ]),
      { capabilities: { 'github.issue.list': c } },
    );
    const out = await wrapped({ source: 'github.issue.list' });
    expect(out).toEqual([
      { id: 1, title: 'One', emphasis: 'high' },
      { id: 2, title: 'Two', emphasis: 'high' },
    ]);
  });

  it('is a no-op for normal-salience capabilities', async () => {
    const c = cap('normal', 'github.repo.list');
    const wrapped = withHighSalienceEmphasis(fakeResolver([{ id: 1 }]), {
      capabilities: { 'github.repo.list': c },
    });
    const out = await wrapped({ source: 'github.repo.list' });
    expect(out).toEqual([{ id: 1 }]);
  });

  it('is a no-op for low-salience capabilities', async () => {
    const c = cap('low', 'github.api.rate_limit');
    const wrapped = withHighSalienceEmphasis(fakeResolver([{ remaining: 100 }]), {
      capabilities: { 'github.api.rate_limit': c },
    });
    const out = await wrapped({ source: 'github.api.rate_limit' });
    expect(out).toEqual([{ remaining: 100 }]);
  });

  it('is a no-op when the capability is unknown', async () => {
    const wrapped = withHighSalienceEmphasis(fakeResolver([{ id: 1 }]), {
      capabilities: {},
    });
    const out = await wrapped({ source: 'unknown.cap' });
    expect(out).toEqual([{ id: 1 }]);
  });

  it('promotes via priority_overrides even when the capability declares no level', async () => {
    const c = cap(undefined, 'task.assignee.list');
    const overrides: NonNullable<IntentProfile['priority_overrides']> = [
      { capability_pattern: 'task.**', salience: 'high' },
    ];
    const wrapped = withHighSalienceEmphasis(fakeResolver([{ id: 1 }, { id: 2 }]), {
      capabilities: { 'task.assignee.list': c },
      priorityOverrides: overrides,
    });
    const out = await wrapped({ source: 'task.assignee.list' });
    expect(out).toEqual([
      { id: 1, emphasis: 'high' },
      { id: 2, emphasis: 'high' },
    ]);
  });

  it('lets a row’s pre-existing `emphasis` win', async () => {
    const c = cap('high', 'github.issue.list');
    const wrapped = withHighSalienceEmphasis(
      fakeResolver([{ id: 1, emphasis: 'low' }, { id: 2 }]),
      { capabilities: { 'github.issue.list': c } },
    );
    const out = await wrapped({ source: 'github.issue.list' });
    expect(out).toEqual([
      { id: 1, emphasis: 'low' },
      { id: 2, emphasis: 'high' },
    ]);
  });

  it('handles a `{ items: [...] }` payload shape', async () => {
    const c = cap('high', 'github.issue.list');
    const wrapped = withHighSalienceEmphasis(
      fakeResolver({ count: 2, items: [{ id: 1 }, { id: 2 }] }),
      { capabilities: { 'github.issue.list': c } },
    );
    const out = await wrapped({ source: 'github.issue.list' });
    expect(out).toEqual({
      count: 2,
      items: [
        { id: 1, emphasis: 'high' },
        { id: 2, emphasis: 'high' },
      ],
    });
  });

  it('passes through unknown payload shapes unchanged', async () => {
    const c = cap('high', 'github.issue.summary');
    const wrapped = withHighSalienceEmphasis(
      // Single object, not an array — should pass through.
      fakeResolver({ open_issues: 5 }),
      { capabilities: { 'github.issue.summary': c } },
    );
    const out = await wrapped({ source: 'github.issue.summary' });
    expect(out).toEqual({ open_issues: 5 });
  });

  it('passes undefined / null through unchanged', async () => {
    const c = cap('high', 'github.issue.list');
    const wrappedU = withHighSalienceEmphasis(fakeResolver(undefined), {
      capabilities: { 'github.issue.list': c },
    });
    expect(await wrappedU({ source: 'github.issue.list' })).toBeUndefined();

    const wrappedN = withHighSalienceEmphasis(fakeResolver(null), {
      capabilities: { 'github.issue.list': c },
    });
    expect(await wrappedN({ source: 'github.issue.list' })).toBeNull();
  });

  it('the first matching priority_override wins over subsequent rules', async () => {
    const c = cap('low', 'github.issue.list');
    const wrapped = withHighSalienceEmphasis(fakeResolver([{ id: 1 }]), {
      capabilities: { 'github.issue.list': c },
      priorityOverrides: [
        { capability_pattern: 'github.issue.list', salience: 'high' },
        { capability_pattern: 'github.**', salience: 'normal' },
      ],
    });
    const out = await wrapped({ source: 'github.issue.list' });
    expect(out).toEqual([{ id: 1, emphasis: 'high' }]);
  });
});
