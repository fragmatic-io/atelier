// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { afterEach, describe, expect, it, vi } from 'vitest';
import { viewTransition } from '../../src/motion/view-transition.js';

type StubGlobals = { window?: unknown; document?: unknown };

function installEnv(opts: {
  reduced?: boolean;
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
}): () => void {
  const stub = globalThis as unknown as StubGlobals;
  const prevWindow = stub.window;
  const prevDocument = stub.document;
  stub.window = {
    matchMedia: (q: string) => ({
      matches: q.includes('reduce') ? Boolean(opts.reduced) : false,
    }),
  };
  stub.document = opts.startViewTransition ? { startViewTransition: opts.startViewTransition } : {};
  return (): void => {
    stub.window = prevWindow;
    stub.document = prevDocument;
  };
}

describe('viewTransition', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('falls back to plain await when the API is unavailable', async () => {
    restore = installEnv({ reduced: false });
    const cb = vi.fn(() => undefined);
    await viewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('falls back to plain await under reduced-motion even if the API is supported', async () => {
    const startViewTransition = vi.fn(() => ({ finished: Promise.resolve() }));
    restore = installEnv({ reduced: true, startViewTransition });
    const cb = vi.fn(() => undefined);
    await viewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it('routes through startViewTransition when supported and motion allowed', async () => {
    const startViewTransition = vi.fn((cb: () => void | Promise<void>) => {
      void cb();
      return { finished: Promise.resolve() };
    });
    restore = installEnv({ reduced: false, startViewTransition });
    const cb = vi.fn(() => undefined);
    await viewTransition(cb);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('resolves even if the transition.finished promise rejects', async () => {
    const startViewTransition = vi.fn((cb: () => void | Promise<void>) => {
      void cb();
      const finished = Promise.reject(new Error('skipped'));
      // Detach error so the unhandled-rejection handler doesn't fire.
      finished.catch(() => undefined);
      return { finished };
    });
    restore = installEnv({ reduced: false, startViewTransition });
    const cb = vi.fn(() => undefined);
    await expect(viewTransition(cb)).resolves.toBeUndefined();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('propagates errors thrown by the callback', async () => {
    restore = installEnv({ reduced: false });
    const cb = vi.fn(() => {
      throw new Error('boom');
    });
    await expect(viewTransition(cb)).rejects.toThrow('boom');
  });

  it('awaits async callbacks to completion in fallback path', async () => {
    restore = installEnv({ reduced: false });
    let resolved = false;
    await viewTransition(async () => {
      await new Promise((r) => setTimeout(r, 0));
      resolved = true;
    });
    expect(resolved).toBe(true);
  });
});
