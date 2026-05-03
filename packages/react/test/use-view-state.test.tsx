// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  useViewState,
  type UseViewStateOptions,
  type ViewStateSetter,
} from '../src/hooks/use-view-state.js';

interface ProbeProps<T> {
  routeKey: string;
  defaultValue: T;
  scope?: UseViewStateOptions<T>['scope'];
  onResult: (value: T, set: ViewStateSetter<T>) => void;
}

function Probe<T>({ routeKey, defaultValue, scope, onResult }: ProbeProps<T>): ReactElement {
  // Build options conditionally for `exactOptionalPropertyTypes: true`
  // (omitted is not the same as `undefined`).
  const opts: UseViewStateOptions<T> = { routeKey, defaultValue };
  if (scope !== undefined) opts.scope = scope;
  const [value, set] = useViewState<T>(opts);
  useEffect(() => {
    onResult(value, set);
  });
  return <div data-testid="probe">{JSON.stringify(value)}</div>;
}

interface Captured<T> {
  values: T[];
  setters: Array<ViewStateSetter<T>>;
}

function captureState<T>(): Captured<T> {
  return { values: [], setters: [] };
}

function record<T>(c: Captured<T>) {
  return (v: T, s: ViewStateSetter<T>): void => {
    c.values.push(v);
    c.setters.push(s);
  };
}

function lastSetter<T>(c: Captured<T>): ViewStateSetter<T> {
  const s = c.setters[c.setters.length - 1];
  if (s === undefined) throw new Error('hook never produced a setter');
  return s;
}

function lastValue<T>(c: Captured<T>): T {
  if (c.values.length === 0) throw new Error('hook never produced a value');
  return c.values[c.values.length - 1] as T;
}

describe('useViewState — basics', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('returns defaultValue when nothing is persisted', () => {
    const c = captureState<{ selected: string | null }>();
    render(
      <Probe<{ selected: string | null }>
        routeKey="/inbox"
        defaultValue={{ selected: null }}
        onResult={record(c)}
      />,
    );
    expect(lastValue(c)).toEqual({ selected: null });
  });

  it('namespaces storage under `${routeKey}.view`', () => {
    const c = captureState<{ filter: string }>();
    render(<Probe routeKey="/inbox" defaultValue={{ filter: 'all' }} onResult={record(c)} />);
    act(() => {
      lastSetter(c)({ filter: 'unread' });
    });
    expect(window.sessionStorage.getItem('/inbox.view')).toBe('{"filter":"unread"}');
    // The companion `.scroll` slot stays free for `useScrollRestore`.
    expect(window.sessionStorage.getItem('/inbox.scroll')).toBeNull();
  });

  it('round-trips per-route across mount/unmount', () => {
    const cFirst = captureState<readonly string[]>();
    const { unmount } = render(
      <Probe
        routeKey="/projects"
        defaultValue={[] as readonly string[]}
        onResult={record(cFirst)}
      />,
    );
    act(() => {
      lastSetter(cFirst)(['p1', 'p2']);
    });
    unmount();

    const cSecond = captureState<readonly string[]>();
    render(
      <Probe
        routeKey="/projects"
        defaultValue={[] as readonly string[]}
        onResult={record(cSecond)}
      />,
    );
    expect(lastValue(cSecond)).toEqual(['p1', 'p2']);
  });

  it('different routeKeys do not collide', () => {
    const cInbox = captureState<{ selected: string | null }>();
    const cProjects = captureState<{ selected: string | null }>();
    render(
      <Probe<{ selected: string | null }>
        routeKey="/inbox"
        defaultValue={{ selected: null }}
        onResult={record(cInbox)}
      />,
    );
    render(
      <Probe<{ selected: string | null }>
        routeKey="/projects"
        defaultValue={{ selected: null }}
        onResult={record(cProjects)}
      />,
    );
    act(() => {
      lastSetter(cInbox)({ selected: 'thread-42' });
    });
    expect(lastValue(cInbox)).toEqual({ selected: 'thread-42' });
    // `/projects` is untouched — separate `${routeKey}.view` slot.
    expect(lastValue(cProjects)).toEqual({ selected: null });
    expect(window.sessionStorage.getItem('/inbox.view')).toBe('{"selected":"thread-42"}');
    expect(window.sessionStorage.getItem('/projects.view')).toBeNull();
  });

  it('functional setter receives the previous view-state', () => {
    const c = captureState<{ count: number }>();
    render(<Probe routeKey="/counter" defaultValue={{ count: 0 }} onResult={record(c)} />);
    act(() => {
      lastSetter(c)((prev) => ({ count: prev.count + 1 }));
    });
    act(() => {
      lastSetter(c)((prev) => ({ count: prev.count + 2 }));
    });
    expect(lastValue(c)).toEqual({ count: 3 });
  });

  it('honours scope=local when requested', () => {
    const c = captureState<{ pinned: boolean }>();
    render(
      <Probe
        routeKey="/settings"
        defaultValue={{ pinned: false }}
        scope="local"
        onResult={record(c)}
      />,
    );
    act(() => {
      lastSetter(c)({ pinned: true });
    });
    expect(window.localStorage.getItem('/settings.view')).toBe('{"pinned":true}');
    // Default `'session'` slot stays empty under the `local` scope.
    expect(window.sessionStorage.getItem('/settings.view')).toBeNull();
  });

  it('defaults to session scope (not local)', () => {
    const c = captureState<number>();
    render(<Probe routeKey="/scope" defaultValue={0} onResult={record(c)} />);
    act(() => {
      lastSetter(c)(7);
    });
    expect(window.sessionStorage.getItem('/scope.view')).toBe('7');
    expect(window.localStorage.getItem('/scope.view')).toBeNull();
  });
});

describe('useViewState — SSR safety', () => {
  it('returns defaultValue with no window (SSR)', () => {
    const originalWindow = globalThis.window as unknown;
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });
    try {
      const c = captureState<{ tab: string }>();
      const out = renderToString(
        <Probe routeKey="/ssr" defaultValue={{ tab: 'overview' }} onResult={record(c)} />,
      );
      expect(out).toContain('overview');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });
});
