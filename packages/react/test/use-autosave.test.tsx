// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, useState, type ReactElement } from 'react';
import {
  useAutosave,
  type AutosaveStatus,
  type UseAutosaveResult,
} from '../src/hooks/use-autosave.js';

interface ProbeProps<T> {
  initialValue: T;
  save: (value: T) => Promise<void>;
  debounceMs?: number;
  onSaved?: (timestamp: number) => void;
  onError?: (err: unknown) => void;
  onResult: (value: T, setValue: (next: T) => void, api: UseAutosaveResult) => void;
}

function Probe<T>({
  initialValue,
  save,
  debounceMs,
  onSaved,
  onError,
  onResult,
}: ProbeProps<T>): ReactElement {
  const [value, setValue] = useState<T>(initialValue);
  const opts: Parameters<typeof useAutosave<T>>[0] = { value, save };
  if (debounceMs !== undefined) opts.debounceMs = debounceMs;
  if (onSaved !== undefined) opts.onSaved = onSaved;
  if (onError !== undefined) opts.onError = onError;
  const api = useAutosave<T>(opts);
  useEffect(() => {
    onResult(value, setValue, api);
  });
  return <div data-testid="probe">{api.status}</div>;
}

interface Captured<T> {
  values: T[];
  setters: Array<(next: T) => void>;
  apis: UseAutosaveResult[];
}

function captureState<T>(): Captured<T> {
  return { values: [], setters: [], apis: [] };
}

function record<T>(c: Captured<T>) {
  return (v: T, set: (next: T) => void, api: UseAutosaveResult): void => {
    c.values.push(v);
    c.setters.push(set);
    c.apis.push(api);
  };
}

function lastApi<T>(c: Captured<T>): UseAutosaveResult {
  const api = c.apis[c.apis.length - 1];
  if (api === undefined) throw new Error('hook never produced a result');
  return api;
}

function lastSetter<T>(c: Captured<T>): (next: T) => void {
  const s = c.setters[c.setters.length - 1];
  if (s === undefined) throw new Error('hook never produced a setter');
  return s;
}

function statusHistory<T>(c: Captured<T>): AutosaveStatus[] {
  return c.apis.map((a) => a.status);
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

describe('useAutosave — debounce + coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces rapid changes into a single save', async () => {
    const save = vi.fn((_: string): Promise<void> => Promise.resolve());
    const c = captureState<string>();
    render(<Probe initialValue="" save={save} debounceMs={100} onResult={record(c)} />);

    act(() => {
      lastSetter(c)('a');
    });
    act(() => {
      lastSetter(c)('ab');
    });
    act(() => {
      lastSetter(c)('abc');
    });

    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc');
  });

  it('coalesces saves: a change during in-flight save schedules exactly one follow-up', async () => {
    let resolveFirst: (() => void) | null = null;
    const save = vi.fn((_: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    });
    const c = captureState<string>();
    render(<Probe initialValue="" save={save} debounceMs={50} onResult={record(c)} />);

    // Set a value; debounce fires the first save.
    act(() => {
      lastSetter(c)('one');
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('one');

    // While the first save is pending, mutate twice more.
    act(() => {
      lastSetter(c)('two');
    });
    act(() => {
      lastSetter(c)('three');
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Resolve the first save — exactly one follow-up should fire with
    // the latest value.
    await act(async () => {
      resolveFirst?.();
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('three');
  });

  it('does not save when the value is unchanged', async () => {
    const save = vi.fn((_: string): Promise<void> => Promise.resolve());
    const c = captureState<string>();
    render(<Probe initialValue="hello" save={save} debounceMs={50} onResult={record(c)} />);

    await act(async () => {
      vi.advanceTimersByTime(500);
      await flushMicrotasks();
    });

    expect(save).not.toHaveBeenCalled();
    expect(lastApi(c).status).toBe('idle');
  });

  it('skips the save when the user types back to the persisted value before debounce fires', async () => {
    const save = vi.fn((_: string): Promise<void> => Promise.resolve());
    const c = captureState<string>();
    render(<Probe initialValue="hello" save={save} debounceMs={100} onResult={record(c)} />);

    act(() => {
      lastSetter(c)('hello!');
    });
    expect(lastApi(c).status).toBe('pending');
    act(() => {
      lastSetter(c)('hello');
    });
    expect(lastApi(c).status).toBe('idle');

    await act(async () => {
      vi.advanceTimersByTime(200);
      await flushMicrotasks();
    });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('useAutosave — status transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('transitions idle -> pending -> saving -> saved on a successful save', async () => {
    let resolveSave: (() => void) | null = null;
    const save = vi.fn((_: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        resolveSave = resolve;
      });
    });
    const c = captureState<string>();
    render(<Probe initialValue="" save={save} debounceMs={50} onResult={record(c)} />);
    expect(lastApi(c).status).toBe('idle');

    act(() => {
      lastSetter(c)('x');
    });
    expect(lastApi(c).status).toBe('pending');

    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
    });
    expect(lastApi(c).status).toBe('saving');

    await act(async () => {
      resolveSave?.();
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(lastApi(c).status).toBe('saved');

    // History should have included each transition.
    const history = statusHistory(c);
    expect(history).toContain('pending');
    expect(history).toContain('saving');
    expect(history).toContain('saved');
  });

  it('records a lastSavedAt timestamp on success and fires onSaved', async () => {
    const save = vi.fn((_: string): Promise<void> => Promise.resolve());
    const onSaved = vi.fn();
    const c = captureState<string>();
    const before = Date.now();
    render(
      <Probe initialValue="" save={save} debounceMs={50} onSaved={onSaved} onResult={record(c)} />,
    );
    act(() => {
      lastSetter(c)('x');
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
      await flushMicrotasks();
    });
    const ts = lastApi(c).lastSavedAt;
    expect(ts).not.toBeNull();
    expect(ts as number).toBeGreaterThanOrEqual(before);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0]?.[0]).toBe(ts);
  });

  it('transitions to error and exposes the error on save() rejection', async () => {
    const boom = new Error('network down');
    const save = vi.fn((_: string): Promise<void> => Promise.reject(boom));
    const onError = vi.fn();
    const c = captureState<string>();
    render(
      <Probe initialValue="" save={save} debounceMs={50} onError={onError} onResult={record(c)} />,
    );
    act(() => {
      lastSetter(c)('x');
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(lastApi(c).status).toBe('error');
    expect(lastApi(c).error).toBe(boom);
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('clears error state on the next successful save', async () => {
    let attempt = 0;
    const save = vi.fn((_: string): Promise<void> => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('first fails'));
      return Promise.resolve();
    });
    const c = captureState<string>();
    render(<Probe initialValue="" save={save} debounceMs={50} onResult={record(c)} />);

    act(() => {
      lastSetter(c)('a');
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(lastApi(c).status).toBe('error');

    act(() => {
      lastSetter(c)('ab');
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(lastApi(c).status).toBe('saved');
    expect(lastApi(c).error).toBeNull();
  });
});

describe('useAutosave — flush()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flush() bypasses the debounce and saves immediately', async () => {
    const save = vi.fn((_: string): Promise<void> => Promise.resolve());
    const c = captureState<string>();
    render(<Probe initialValue="" save={save} debounceMs={5000} onResult={record(c)} />);

    act(() => {
      lastSetter(c)('urgent');
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await lastApi(c).flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('urgent');
    expect(lastApi(c).status).toBe('saved');
  });

  it('flush() resolves immediately when the value is unchanged', async () => {
    const save = vi.fn((_: string): Promise<void> => Promise.resolve());
    const c = captureState<string>();
    render(<Probe initialValue="hello" save={save} debounceMs={50} onResult={record(c)} />);

    await act(async () => {
      await lastApi(c).flush();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('flush() awaits an in-flight save', async () => {
    let resolveSave: (() => void) | null = null;
    const save = vi.fn((_: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        resolveSave = resolve;
      });
    });
    const c = captureState<string>();
    render(<Probe initialValue="" save={save} debounceMs={50} onResult={record(c)} />);

    act(() => {
      lastSetter(c)('x');
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
    });
    expect(lastApi(c).status).toBe('saving');

    let flushed = false;
    const flushPromise = lastApi(c)
      .flush()
      .then(() => {
        flushed = true;
      });

    await flushMicrotasks();
    expect(flushed).toBe(false);

    await act(async () => {
      resolveSave?.();
      await flushPromise;
    });
    expect(flushed).toBe(true);
  });
});

describe('useAutosave — non-string payloads', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats structurally-equal objects as unchanged', async () => {
    const save = vi.fn((_: { a: number }): Promise<void> => Promise.resolve());
    const c = captureState<{ a: number }>();
    render(<Probe initialValue={{ a: 1 }} save={save} debounceMs={50} onResult={record(c)} />);
    act(() => {
      lastSetter(c)({ a: 1 });
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
      await flushMicrotasks();
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('detects nested mutations as changes', async () => {
    const save = vi.fn((_: { a: { b: number } }): Promise<void> => Promise.resolve());
    const c = captureState<{ a: { b: number } }>();
    render(
      <Probe initialValue={{ a: { b: 1 } }} save={save} debounceMs={50} onResult={record(c)} />,
    );
    act(() => {
      lastSetter(c)({ a: { b: 2 } });
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ a: { b: 2 } });
  });
});
