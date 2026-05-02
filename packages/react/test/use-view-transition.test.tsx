// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { useViewTransition } from '../src/hooks/use-view-transition.js';

interface ProbeProps {
  onReady: (run: (cb: () => void | Promise<void>) => Promise<void>) => void;
}

function Probe({ onReady }: ProbeProps): ReactElement {
  const run = useViewTransition();
  useEffect(() => {
    onReady(run);
  }, [onReady, run]);
  return <div />;
}

describe('useViewTransition', () => {
  let originalMM: typeof window.matchMedia | undefined;
  afterEach(() => {
    if (originalMM !== undefined) {
      window.matchMedia = originalMM;
      originalMM = undefined;
    }
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it('returns a stable function that calls the callback (fallback path)', async () => {
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    let captured: ((cb: () => void | Promise<void>) => Promise<void>) | null = null;
    render(<Probe onReady={(r) => (captured = r)} />);
    const cb = vi.fn(() => undefined);
    await captured!(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('routes through document.startViewTransition when available', async () => {
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const startViewTransition = vi.fn((fn: () => void | Promise<void>) => {
      void fn();
      return { finished: Promise.resolve() };
    });
    (document as unknown as { startViewTransition: unknown }).startViewTransition =
      startViewTransition;
    let captured: ((cb: () => void | Promise<void>) => Promise<void>) | null = null;
    render(<Probe onReady={(r) => (captured = r)} />);
    const cb = vi.fn(() => undefined);
    await captured!(cb);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips the API under reduced-motion', async () => {
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const startViewTransition = vi.fn(() => ({ finished: Promise.resolve() }));
    (document as unknown as { startViewTransition: unknown }).startViewTransition =
      startViewTransition;
    let captured: ((cb: () => void | Promise<void>) => Promise<void>) | null = null;
    render(<Probe onReady={(r) => (captured = r)} />);
    const cb = vi.fn(() => undefined);
    await captured!(cb);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
