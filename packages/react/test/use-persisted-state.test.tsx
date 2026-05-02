// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  PersistedVaultContext,
  type PersistedVaultClient,
  type PersistedSetter,
  usePersistedState,
} from '../src/hooks/use-persisted-state.js';

interface ProbeProps<T> {
  storageKey: string | undefined;
  defaultValue: T;
  scope?: 'session' | 'local' | 'vault';
  onResult: (value: T, set: PersistedSetter<T>) => void;
}

function Probe<T>({ storageKey, defaultValue, scope, onResult }: ProbeProps<T>): ReactElement {
  const opts: Parameters<typeof usePersistedState<T>>[0] = { storageKey, defaultValue };
  if (scope !== undefined) opts.scope = scope;
  const [value, set] = usePersistedState<T>(opts);
  useEffect(() => {
    onResult(value, set);
  });
  return <div data-testid="probe">{JSON.stringify(value)}</div>;
}

interface Captured<T> {
  values: T[];
  setters: Array<PersistedSetter<T>>;
}

function captureState<T>(): Captured<T> {
  return { values: [], setters: [] };
}

function record<T>(c: Captured<T>) {
  return (v: T, s: PersistedSetter<T>): void => {
    c.values.push(v);
    c.setters.push(s);
  };
}

function lastSetter<T>(c: Captured<T>): PersistedSetter<T> {
  const s = c.setters[c.setters.length - 1];
  if (s === undefined) throw new Error('hook never produced a setter');
  return s;
}

function lastValue<T>(c: Captured<T>): T {
  if (c.values.length === 0) throw new Error('hook never produced a value');
  return c.values[c.values.length - 1] as T;
}

describe('usePersistedState — defaults and disabled persistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('returns defaultValue when storageKey is undefined', () => {
    const c = captureState<number>();
    render(<Probe storageKey={undefined} defaultValue={5} onResult={record(c)} />);
    expect(lastValue(c)).toBe(5);
  });

  it('with no storageKey, set updates state but writes nothing', () => {
    const c = captureState<number>();
    render(<Probe storageKey={undefined} defaultValue={1} onResult={record(c)} />);
    act(() => {
      lastSetter(c)(7);
    });
    expect(lastValue(c)).toBe(7);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });

  it('returns defaultValue when key absent (session scope)', () => {
    const c = captureState<string>();
    render(<Probe storageKey="t.session" defaultValue="hello" onResult={record(c)} />);
    expect(lastValue(c)).toBe('hello');
  });
});

describe('usePersistedState — session scope', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('writes to sessionStorage on set', () => {
    const c = captureState<{ open: boolean }>();
    render(<Probe storageKey="t.s.open" defaultValue={{ open: false }} onResult={record(c)} />);
    act(() => {
      lastSetter(c)({ open: true });
    });
    expect(window.sessionStorage.getItem('t.s.open')).toBe('{"open":true}');
  });

  it('reads from sessionStorage on mount', () => {
    window.sessionStorage.setItem('t.s.read', '{"n":42}');
    const c = captureState<{ n: number }>();
    render(<Probe storageKey="t.s.read" defaultValue={{ n: 0 }} onResult={record(c)} />);
    expect(lastValue(c)).toEqual({ n: 42 });
  });

  it('round-trips across mount/unmount', () => {
    const cFirst = captureState<readonly string[]>();
    const { unmount } = render(
      <Probe
        storageKey="t.s.trip"
        defaultValue={[] as readonly string[]}
        onResult={record(cFirst)}
      />,
    );
    act(() => {
      lastSetter(cFirst)(['a', 'b']);
    });
    unmount();

    const cSecond = captureState<readonly string[]>();
    render(
      <Probe
        storageKey="t.s.trip"
        defaultValue={[] as readonly string[]}
        onResult={record(cSecond)}
      />,
    );
    expect(lastValue(cSecond)).toEqual(['a', 'b']);
  });

  it('falls back to defaultValue on corrupt JSON', () => {
    window.sessionStorage.setItem('t.s.corrupt', 'not-json');
    const c = captureState<number>();
    render(<Probe storageKey="t.s.corrupt" defaultValue={9} onResult={record(c)} />);
    expect(lastValue(c)).toBe(9);
  });

  it('functional setter receives the previous value', () => {
    const c = captureState<number>();
    render(<Probe storageKey="t.s.fn" defaultValue={1} onResult={record(c)} />);
    act(() => {
      lastSetter(c)((prev) => prev + 1);
    });
    act(() => {
      lastSetter(c)((prev) => prev + 1);
    });
    expect(lastValue(c)).toBe(3);
    expect(window.sessionStorage.getItem('t.s.fn')).toBe('3');
  });
});

describe('usePersistedState — local scope + cross-tab', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('writes to localStorage on set when scope=local', () => {
    const c = captureState<boolean>();
    render(<Probe storageKey="t.l.flag" defaultValue={false} scope="local" onResult={record(c)} />);
    act(() => {
      lastSetter(c)(true);
    });
    expect(window.localStorage.getItem('t.l.flag')).toBe('true');
  });

  it('updates from a cross-tab storage event', () => {
    const c = captureState<number>();
    render(<Probe storageKey="t.l.sync" defaultValue={0} scope="local" onResult={record(c)} />);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 't.l.sync',
          newValue: '99',
          storageArea: window.localStorage,
        }),
      );
    });
    expect(lastValue(c)).toBe(99);
  });

  it('ignores storage events for OTHER keys', () => {
    const c = captureState<number>();
    render(<Probe storageKey="t.l.scoped" defaultValue={1} scope="local" onResult={record(c)} />);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 't.l.unrelated',
          newValue: '999',
          storageArea: window.localStorage,
        }),
      );
    });
    expect(lastValue(c)).toBe(1);
  });
});

describe('usePersistedState — SSR safety', () => {
  it('returns defaultValue with no window (SSR)', () => {
    const originalWindow = globalThis.window as unknown;
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });
    try {
      const c = captureState<string>();
      const out = renderToString(
        <Probe storageKey="t.ssr" defaultValue="default-ssr" onResult={record(c)} />,
      );
      expect(out).toContain('default-ssr');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });
});

describe('usePersistedState — vault scope', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function makeVault(initial: Record<string, string> = {}): PersistedVaultClient & {
    writes: Array<[string, string]>;
    listeners: Map<string, Array<(v: string | null) => void>>;
    push: (key: string, value: string | null) => void;
  } {
    const store = new Map<string, string>(Object.entries(initial));
    const writes: Array<[string, string]> = [];
    const listeners = new Map<string, Array<(v: string | null) => void>>();
    return {
      read: (key) => store.get(key) ?? null,
      write: (key, value) => {
        store.set(key, value);
        writes.push([key, value]);
      },
      remove: (key) => {
        store.delete(key);
      },
      subscribe: (key, listener) => {
        const arr = listeners.get(key) ?? [];
        arr.push(listener);
        listeners.set(key, arr);
        return () => {
          const cur = listeners.get(key) ?? [];
          listeners.set(
            key,
            cur.filter((l) => l !== listener),
          );
        };
      },
      writes,
      listeners,
      push: (key, value) => {
        if (value === null) store.delete(key);
        else store.set(key, value);
        for (const l of listeners.get(key) ?? []) l(value);
      },
    };
  }

  it('writes through to the vault when provided', async () => {
    const vault = makeVault();
    const c = captureState<{ pinned: boolean }>();
    render(
      <PersistedVaultContext.Provider value={vault}>
        <Probe
          storageKey="vault.pin"
          defaultValue={{ pinned: false }}
          scope="vault"
          onResult={record(c)}
        />
      </PersistedVaultContext.Provider>,
    );
    await act(async () => {
      lastSetter(c)({ pinned: true });
      // Flush microtasks so the promise-tracked vault write resolves
      // before assertions run.
      await Promise.resolve();
    });
    expect(vault.writes).toContainEqual(['vault.pin', '{"pinned":true}']);
    expect(lastValue(c)).toEqual({ pinned: true });
  });

  it('reads from the vault on mount (async)', async () => {
    const vault = makeVault({ 'vault.read': '{"n":7}' });
    const c = captureState<{ n: number }>();
    await act(async () => {
      render(
        <PersistedVaultContext.Provider value={vault}>
          <Probe
            storageKey="vault.read"
            defaultValue={{ n: 0 }}
            scope="vault"
            onResult={record(c)}
          />
        </PersistedVaultContext.Provider>,
      );
      // Mount kicks off `vault.read()` — flush so the resolved value
      // applies before the assertion below.
      await Promise.resolve();
    });
    expect(lastValue(c)).toEqual({ n: 7 });
  });

  it('subscribes for cross-device updates when supported', async () => {
    const vault = makeVault();
    const c = captureState<number>();
    await act(async () => {
      render(
        <PersistedVaultContext.Provider value={vault}>
          <Probe storageKey="vault.sub" defaultValue={0} scope="vault" onResult={record(c)} />
        </PersistedVaultContext.Provider>,
      );
      await Promise.resolve();
    });
    act(() => {
      vault.push('vault.sub', '42');
    });
    expect(lastValue(c)).toBe(42);
  });

  it('falls back to localStorage when scope=vault but no provider in scope', () => {
    const c = captureState<{ flag: boolean }>();
    render(
      <Probe
        storageKey="vault.fallback"
        defaultValue={{ flag: false }}
        scope="vault"
        onResult={record(c)}
      />,
    );
    act(() => {
      lastSetter(c)({ flag: true });
    });
    expect(window.localStorage.getItem('vault.fallback')).toBe('{"flag":true}');
  });

  it('continues with local state when vault.write rejects', async () => {
    const vault: PersistedVaultClient = {
      read: () => null,
      write: () => Promise.reject(new Error('vault offline')),
    };
    const c = captureState<number>();
    await act(async () => {
      render(
        <PersistedVaultContext.Provider value={vault}>
          <Probe storageKey="vault.boom" defaultValue={0} scope="vault" onResult={record(c)} />
        </PersistedVaultContext.Provider>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      lastSetter(c)(11);
      // Allow the rejected vault.write promise to settle without an
      // unhandled-rejection warning surfacing.
      await Promise.resolve();
    });
    expect(lastValue(c)).toBe(11);
  });
});

describe('usePersistedState — error tolerance', () => {
  it('survives sessionStorage.getItem throwing on mount', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      const c = captureState<number>();
      render(<Probe storageKey="t.boom.read" defaultValue={5} onResult={record(c)} />);
      expect(lastValue(c)).toBe(5);
    } finally {
      spy.mockRestore();
    }
  });

  it('silently no-ops when sessionStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const c = captureState<number>();
      render(<Probe storageKey="t.boom.write" defaultValue={1} onResult={record(c)} />);
      expect(() => {
        act(() => {
          lastSetter(c)(2);
        });
      }).not.toThrow();
      expect(lastValue(c)).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});
