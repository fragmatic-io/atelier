// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, useState, type ReactElement } from 'react';
import {
  useVersionHistory,
  type UseVersionHistoryResult,
} from '../src/hooks/use-version-history.js';

interface ProbeProps<T> {
  storageKey: string | undefined;
  initialValue: T;
  maxVersions?: number;
  scope?: 'session' | 'local';
  onResult: (value: T, setValue: (next: T) => void, api: UseVersionHistoryResult<T>) => void;
}

function Probe<T>({
  storageKey,
  initialValue,
  maxVersions,
  scope,
  onResult,
}: ProbeProps<T>): ReactElement {
  const [value, setValue] = useState<T>(initialValue);
  const opts: Parameters<typeof useVersionHistory<T>>[0] = { storageKey, value };
  if (maxVersions !== undefined) opts.maxVersions = maxVersions;
  if (scope !== undefined) opts.scope = scope;
  const api = useVersionHistory<T>(opts);
  useEffect(() => {
    onResult(value, setValue, api);
  });
  return <div data-testid="probe">{api.versions.length}</div>;
}

interface Captured<T> {
  values: T[];
  setters: Array<(next: T) => void>;
  apis: Array<UseVersionHistoryResult<T>>;
}

function captureState<T>(): Captured<T> {
  return { values: [], setters: [], apis: [] };
}

function record<T>(c: Captured<T>) {
  return (v: T, set: (next: T) => void, api: UseVersionHistoryResult<T>): void => {
    c.values.push(v);
    c.setters.push(set);
    c.apis.push(api);
  };
}

function lastApi<T>(c: Captured<T>): UseVersionHistoryResult<T> {
  const api = c.apis[c.apis.length - 1];
  if (api === undefined) throw new Error('hook never produced a result');
  return api;
}

function lastSetter<T>(c: Captured<T>): (next: T) => void {
  const s = c.setters[c.setters.length - 1];
  if (s === undefined) throw new Error('hook never produced a setter');
  return s;
}

describe('useVersionHistory — commit', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('starts with no versions', () => {
    const c = captureState<string>();
    render(<Probe storageKey={undefined} initialValue="hello" onResult={record(c)} />);
    expect(lastApi(c).versions).toHaveLength(0);
  });

  it('snapshots the current value on commit()', () => {
    const c = captureState<string>();
    render(<Probe storageKey={undefined} initialValue="hello" onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    expect(lastApi(c).versions).toHaveLength(1);
    expect(lastApi(c).versions[0]?.value).toBe('hello');
    expect(typeof lastApi(c).versions[0]?.id).toBe('string');
    expect(typeof lastApi(c).versions[0]?.createdAt).toBe('number');
  });

  it('stores an optional note', () => {
    const c = captureState<string>();
    render(<Probe storageKey={undefined} initialValue="hello" onResult={record(c)} />);
    act(() => {
      lastApi(c).commit('initial');
    });
    expect(lastApi(c).versions[0]?.note).toBe('initial');
  });

  it('skips commit when value is structurally unchanged from the last version', () => {
    const c = captureState<{ a: number }>();
    render(<Probe storageKey={undefined} initialValue={{ a: 1 }} onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    act(() => {
      lastApi(c).commit();
    });
    // Same object identity AND same shape — second commit is a no-op.
    expect(lastApi(c).versions).toHaveLength(1);

    act(() => {
      // Identity-different but structurally equal.
      lastSetter(c)({ a: 1 });
    });
    act(() => {
      lastApi(c).commit();
    });
    expect(lastApi(c).versions).toHaveLength(1);

    act(() => {
      lastSetter(c)({ a: 2 });
    });
    act(() => {
      lastApi(c).commit();
    });
    expect(lastApi(c).versions).toHaveLength(2);
  });

  it('snapshots are deep-copied — mutating the live value does not affect history', () => {
    const c = captureState<{ items: number[] }>();
    render(<Probe storageKey={undefined} initialValue={{ items: [1, 2] }} onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    const snapshotBefore = lastApi(c).versions[0]?.value;
    expect(snapshotBefore?.items).toEqual([1, 2]);

    // Mutate the live value via a new setter call (the hook's snapshot
    // should not change).
    act(() => {
      lastSetter(c)({ items: [9, 9, 9] });
    });
    expect(lastApi(c).versions[0]?.value.items).toEqual([1, 2]);
  });

  it('caps versions at maxVersions and evicts oldest first (FIFO)', () => {
    const c = captureState<number>();
    render(<Probe storageKey={undefined} initialValue={0} maxVersions={3} onResult={record(c)} />);
    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        lastSetter(c)(i);
      });
      act(() => {
        lastApi(c).commit();
      });
    }
    expect(lastApi(c).versions).toHaveLength(3);
    expect(lastApi(c).versions.map((v) => v.value)).toEqual([3, 4, 5]);
  });
});

describe('useVersionHistory — restore + clear', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('restore() returns the snapshotted value by id', () => {
    const c = captureState<string>();
    render(<Probe storageKey={undefined} initialValue="v1" onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    act(() => {
      lastSetter(c)('v2');
    });
    act(() => {
      lastApi(c).commit();
    });
    const ids = lastApi(c).versions.map((v) => v.id);
    expect(lastApi(c).restore(ids[0] ?? '')).toBe('v1');
    expect(lastApi(c).restore(ids[1] ?? '')).toBe('v2');
  });

  it('restore() returns undefined for unknown ids', () => {
    const c = captureState<string>();
    render(<Probe storageKey={undefined} initialValue="v1" onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    expect(lastApi(c).restore('does-not-exist')).toBeUndefined();
  });

  it('restored value is a fresh copy — mutating it does not corrupt history', () => {
    const c = captureState<{ items: number[] }>();
    render(<Probe storageKey={undefined} initialValue={{ items: [1, 2] }} onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    const id = lastApi(c).versions[0]?.id ?? '';
    const restored = lastApi(c).restore(id);
    expect(restored?.items).toEqual([1, 2]);
    if (restored !== undefined) restored.items.push(99);
    // History snapshot still pristine.
    expect(lastApi(c).versions[0]?.value.items).toEqual([1, 2]);
  });

  it('clear() drops all versions', () => {
    const c = captureState<number>();
    render(<Probe storageKey={undefined} initialValue={0} onResult={record(c)} />);
    for (let i = 1; i <= 3; i += 1) {
      act(() => {
        lastSetter(c)(i);
      });
      act(() => {
        lastApi(c).commit();
      });
    }
    expect(lastApi(c).versions).toHaveLength(3);
    act(() => {
      lastApi(c).clear();
    });
    expect(lastApi(c).versions).toHaveLength(0);
  });
});

describe('useVersionHistory — non-serializable values + crypto fallbacks', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('still snapshots non-serializable values using the deepCopy fallback path', () => {
    const c = captureState<unknown>();
    // Cyclic reference — JSON.stringify throws; deepCopy must fall through
    // to structuredClone (also throws on cycles, but at least exercises
    // the catch path) and finally to identity.
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    render(<Probe storageKey={undefined} initialValue={cyclic} onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    // Defensive: a snapshot was committed (even if shallow).
    expect(lastApi(c).versions).toHaveLength(1);
  });

  it('falls back to ver_<...> id when crypto.randomUUID is missing', () => {
    // happy-dom may install `crypto` as a getter-only property — we can't
    // re-assign it, but spying on `randomUUID` to return undefined is
    // enough to exercise the fallback branch in `generateId`.
    const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (!cryptoObj || typeof cryptoObj.randomUUID !== 'function') {
      // Already missing — nothing to override; the fallback is what we
      // exercise on every `commit()` here.
      const c = captureState<string>();
      render(<Probe storageKey={undefined} initialValue="hi" onResult={record(c)} />);
      act(() => {
        lastApi(c).commit();
      });
      const id = lastApi(c).versions[0]?.id ?? '';
      expect(id.length).toBeGreaterThan(0);
      return;
    }
    const original = cryptoObj.randomUUID;
    // Replace with `undefined` so `c?.randomUUID !== undefined` is false
    // and the fallback path is taken.
    Object.defineProperty(cryptoObj, 'randomUUID', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      const c = captureState<string>();
      render(<Probe storageKey={undefined} initialValue="hi" onResult={record(c)} />);
      act(() => {
        lastApi(c).commit();
      });
      const id = lastApi(c).versions[0]?.id ?? '';
      expect(id.startsWith('ver_')).toBe(true);
    } finally {
      Object.defineProperty(cryptoObj, 'randomUUID', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });
});

describe('useVersionHistory — persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('persists versions across mount/unmount via localStorage', () => {
    const cFirst = captureState<string>();
    const { unmount } = render(
      <Probe storageKey="vh.persist" initialValue="hello" onResult={record(cFirst)} />,
    );
    act(() => {
      lastApi(cFirst).commit('first');
    });
    act(() => {
      lastSetter(cFirst)('hello world');
    });
    act(() => {
      lastApi(cFirst).commit('second');
    });
    expect(lastApi(cFirst).versions).toHaveLength(2);
    unmount();

    // Re-mount with the same storage key — versions should round-trip.
    const cSecond = captureState<string>();
    render(<Probe storageKey="vh.persist" initialValue="hello" onResult={record(cSecond)} />);
    expect(lastApi(cSecond).versions).toHaveLength(2);
    expect(lastApi(cSecond).versions[0]?.value).toBe('hello');
    expect(lastApi(cSecond).versions[0]?.note).toBe('first');
    expect(lastApi(cSecond).versions[1]?.value).toBe('hello world');
    expect(lastApi(cSecond).versions[1]?.note).toBe('second');
  });

  it('honors session scope', () => {
    const c = captureState<string>();
    render(
      <Probe storageKey="vh.session" initialValue="hi" scope="session" onResult={record(c)} />,
    );
    act(() => {
      lastApi(c).commit();
    });
    expect(window.sessionStorage.getItem('vh.session')).not.toBeNull();
    expect(window.localStorage.getItem('vh.session')).toBeNull();
  });

  it('does not persist when storageKey is undefined', () => {
    const c = captureState<string>();
    render(<Probe storageKey={undefined} initialValue="hi" onResult={record(c)} />);
    act(() => {
      lastApi(c).commit();
    });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('FIFO eviction also applies after reload', () => {
    const cFirst = captureState<number>();
    const { unmount } = render(
      <Probe storageKey="vh.cap" initialValue={0} maxVersions={3} onResult={record(cFirst)} />,
    );
    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        lastSetter(cFirst)(i);
      });
      act(() => {
        lastApi(cFirst).commit();
      });
    }
    expect(lastApi(cFirst).versions.map((v) => v.value)).toEqual([3, 4, 5]);
    unmount();

    const cSecond = captureState<number>();
    render(
      <Probe storageKey="vh.cap" initialValue={0} maxVersions={3} onResult={record(cSecond)} />,
    );
    expect(lastApi(cSecond).versions.map((v) => v.value)).toEqual([3, 4, 5]);
  });
});
