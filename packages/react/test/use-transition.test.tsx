// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import {
  useTransition,
  type UseTransitionOptions,
  type UseTransitionResult,
} from '../src/hooks/use-transition.js';

function setupMatchMedia(reduced: boolean): void {
  window.matchMedia = vi.fn(
    () =>
      ({
        matches: reduced,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

interface ProbeProps {
  options: UseTransitionOptions;
  onState: (s: UseTransitionResult) => void;
}
function Probe({ options, onState }: ProbeProps): ReactElement {
  const state = useTransition(options);
  useEffect(() => {
    onState(state);
  });
  return <div data-testid="probe" data-transition-phase={state.phase} />;
}

describe('useTransition', () => {
  let originalMM: typeof window.matchMedia | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    originalMM = window.matchMedia;
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalMM !== undefined) {
      window.matchMedia = originalMM;
      originalMM = undefined;
    }
  });

  it('cycles entering → entered when in flips false → true', () => {
    setupMatchMedia(false);
    const states: UseTransitionResult[] = [];
    const { rerender } = render(<Probe options={{ in: false }} onState={(s) => states.push(s)} />);
    expect(states[states.length - 1]?.phase).toBe('exited');
    rerender(<Probe options={{ in: true }} onState={(s) => states.push(s)} />);
    expect(states[states.length - 1]?.phase).toBe('entering');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(states[states.length - 1]?.phase).toBe('entered');
  });

  it('cycles exiting → exited when in flips true → false', () => {
    setupMatchMedia(false);
    const states: UseTransitionResult[] = [];
    const { rerender } = render(<Probe options={{ in: true }} onState={(s) => states.push(s)} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(states[states.length - 1]?.phase).toBe('entered');
    rerender(<Probe options={{ in: false }} onState={(s) => states.push(s)} />);
    expect(states[states.length - 1]?.phase).toBe('exiting');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(states[states.length - 1]?.phase).toBe('exited');
  });

  it('reduced motion collapses durationMs to 0 and yields plain opacity style', () => {
    setupMatchMedia(true);
    const states: UseTransitionResult[] = [];
    render(<Probe options={{ in: true }} onState={(s) => states.push(s)} />);
    const last = states[states.length - 1]!;
    expect(last.reducedMotion).toBe(true);
    expect(last.durationMs).toBe(0);
    // No transition declaration under reduced motion.
    expect(last.style.transition).toBeUndefined();
  });

  it('emits a data-transition-phase attribute consumers can style on', () => {
    setupMatchMedia(false);
    const { container, rerender } = render(
      <Probe options={{ in: true }} onState={() => undefined} />,
    );
    const probe = container.querySelector('[data-testid="probe"]') as HTMLElement;
    expect(probe.getAttribute('data-transition-phase')).toBe('entering');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(probe.getAttribute('data-transition-phase')).toBe('entered');
    rerender(<Probe options={{ in: false }} onState={() => undefined} />);
    expect(probe.getAttribute('data-transition-phase')).toBe('exiting');
  });

  it('honours an explicit duration speed', () => {
    setupMatchMedia(false);
    const states: UseTransitionResult[] = [];
    render(<Probe options={{ in: true, duration: 'slow' }} onState={(s) => states.push(s)} />);
    // `slow` defaults to 240 ms in MOTION_DEFAULTS.
    expect(states[states.length - 1]?.durationMs).toBe(240);
  });
});
