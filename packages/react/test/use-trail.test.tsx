// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { useTrail, type TrailSegment, type UseTrailResult } from '../src/hooks/use-trail.js';

interface ProbeProps {
  syncToUrl?: boolean;
  urlKey?: string;
  initialTrail?: readonly TrailSegment[];
  onResult: (r: UseTrailResult) => void;
}

function Probe({ syncToUrl, urlKey, initialTrail, onResult }: ProbeProps): ReactElement {
  // Build the options bag conditionally to satisfy
  // `exactOptionalPropertyTypes: true` (omitted is not the same as `undefined`).
  const opts: Parameters<typeof useTrail>[0] = {};
  if (syncToUrl !== undefined) opts.syncToUrl = syncToUrl;
  if (urlKey !== undefined) opts.urlKey = urlKey;
  if (initialTrail !== undefined) opts.initialTrail = initialTrail;
  const result = useTrail(opts);
  useEffect(() => {
    onResult(result);
  });
  return <div data-testid="probe">{result.trail.length}</div>;
}

function lastResult(captured: UseTrailResult[]): UseTrailResult {
  const last = captured[captured.length - 1];
  if (last === undefined) throw new Error('hook never produced a result');
  return last;
}

describe('useTrail', () => {
  // happy-dom keeps `window.location` between tests; reset to a clean slate.
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('returns an empty trail by default', () => {
    const captured: UseTrailResult[] = [];
    render(<Probe onResult={(r) => captured.push(r)} />);
    expect(lastResult(captured).trail).toEqual([]);
  });

  it('honours initialTrail', () => {
    const captured: UseTrailResult[] = [];
    render(
      <Probe
        initialTrail={[{ label: 'Home' }, { label: 'Charges' }]}
        onResult={(r) => captured.push(r)}
      />,
    );
    expect(lastResult(captured).trail).toEqual([{ label: 'Home' }, { label: 'Charges' }]);
  });

  it('push appends a segment', () => {
    const captured: UseTrailResult[] = [];
    render(<Probe onResult={(r) => captured.push(r)} />);
    act(() => {
      lastResult(captured).push({ label: 'Charges' });
    });
    expect(lastResult(captured).trail).toEqual([{ label: 'Charges' }]);
    act(() => {
      lastResult(captured).push({ label: 'ch_xxx', id: 'ch_xxx' });
    });
    expect(lastResult(captured).trail).toEqual([
      { label: 'Charges' },
      { label: 'ch_xxx', id: 'ch_xxx' },
    ]);
  });

  it('pop removes the deepest segment (no-op on empty)', () => {
    const captured: UseTrailResult[] = [];
    render(
      <Probe initialTrail={[{ label: 'a' }, { label: 'b' }]} onResult={(r) => captured.push(r)} />,
    );
    act(() => {
      lastResult(captured).pop();
    });
    expect(lastResult(captured).trail).toEqual([{ label: 'a' }]);
    act(() => {
      lastResult(captured).pop();
    });
    expect(lastResult(captured).trail).toEqual([]);
    // No-op
    act(() => {
      lastResult(captured).pop();
    });
    expect(lastResult(captured).trail).toEqual([]);
  });

  it('clear empties the trail', () => {
    const captured: UseTrailResult[] = [];
    render(
      <Probe initialTrail={[{ label: 'a' }, { label: 'b' }]} onResult={(r) => captured.push(r)} />,
    );
    act(() => {
      lastResult(captured).clear();
    });
    expect(lastResult(captured).trail).toEqual([]);
  });

  it('setTrail replaces wholesale', () => {
    const captured: UseTrailResult[] = [];
    render(<Probe onResult={(r) => captured.push(r)} />);
    act(() => {
      lastResult(captured).setTrail([{ label: 'X' }, { label: 'Y', id: 'y' }]);
    });
    expect(lastResult(captured).trail).toEqual([{ label: 'X' }, { label: 'Y', id: 'y' }]);
  });

  describe('syncToUrl', () => {
    it('reads the trail from the URL on mount', () => {
      // Escape-aware wire form (matches what the serializer produces).
      window.history.replaceState(null, '', '/?_trail=Charges|ch%5Fxxx_ch%5Fxxx');
      const captured: UseTrailResult[] = [];
      render(<Probe syncToUrl onResult={(r) => captured.push(r)} />);
      // Effect runs after first render — `act` ensures we observe its
      // committed state in `captured` below.
      act(() => {
        /* flush */
      });
      expect(lastResult(captured).trail).toEqual([
        { label: 'Charges' },
        { label: 'ch_xxx', id: 'ch_xxx' },
      ]);
    });

    it('writes the trail back to the URL via replaceState on push', () => {
      const captured: UseTrailResult[] = [];
      render(<Probe syncToUrl onResult={(r) => captured.push(r)} />);
      act(() => {
        lastResult(captured).push({ label: 'Charges' });
      });
      expect(window.location.search).toContain('_trail=Charges');
      act(() => {
        lastResult(captured).push({ label: 'ch_xxx', id: 'ch_xxx' });
      });
      // The raw URL preserves `%5F` (escaped `_` in payload) and the
      // structural `_` between label and id. URLSearchParams.get
      // percent-decodes, so we assert against the raw search string.
      expect(window.location.search).toContain('_trail=Charges|ch%5Fxxx_ch%5Fxxx');
    });

    it('removes the URL key entirely when the trail is cleared', () => {
      const captured: UseTrailResult[] = [];
      render(
        <Probe
          syncToUrl
          initialTrail={[{ label: 'a' }, { label: 'b' }]}
          onResult={(r) => captured.push(r)}
        />,
      );
      act(() => {
        lastResult(captured).clear();
      });
      expect(window.location.search).not.toContain('_trail');
    });

    it('honours a custom urlKey', () => {
      window.history.replaceState(null, '', '/?path=A|B');
      const captured: UseTrailResult[] = [];
      render(<Probe syncToUrl urlKey="path" onResult={(r) => captured.push(r)} />);
      expect(lastResult(captured).trail).toEqual([{ label: 'A' }, { label: 'B' }]);
      act(() => {
        lastResult(captured).push({ label: 'C' });
      });
      const decoded = decodeURIComponent(window.location.search);
      expect(decoded).toContain('path=A|B|C');
    });

    it('preserves other query params on the URL', () => {
      window.history.replaceState(null, '', '/?other=1&_trail=A');
      const captured: UseTrailResult[] = [];
      render(<Probe syncToUrl onResult={(r) => captured.push(r)} />);
      act(() => {
        lastResult(captured).push({ label: 'B' });
      });
      expect(window.location.search).toContain('other=1');
      const decoded = decodeURIComponent(window.location.search);
      expect(decoded).toContain('_trail=A|B');
    });
  });

  describe('SSR safety', () => {
    it('returns the initial trail under simulated SSR (no window.location read)', () => {
      // Simulate SSR by replacing history.replaceState with a throwing stub.
      // If the hook touched it during the lazy initializer, the render below
      // would crash. We render WITHOUT `syncToUrl` to confirm the empty/
      // initial path doesn't touch history at all.
      const originalReplace = window.history.replaceState.bind(window.history);
      const throwingReplace = (): void => {
        throw new Error('replaceState called during SSR');
      };
      Object.defineProperty(window.history, 'replaceState', {
        configurable: true,
        value: throwingReplace,
      });
      const captured: UseTrailResult[] = [];
      try {
        render(<Probe initialTrail={[{ label: 'Home' }]} onResult={(r) => captured.push(r)} />);
        expect(lastResult(captured).trail).toEqual([{ label: 'Home' }]);
      } finally {
        Object.defineProperty(window.history, 'replaceState', {
          configurable: true,
          value: originalReplace,
        });
      }
    });

    it('survives writeTrailToUrl throwing (replaceState rejected)', () => {
      const originalReplace = window.history.replaceState.bind(window.history);
      const throwingReplace = (): void => {
        throw new Error('blocked');
      };
      Object.defineProperty(window.history, 'replaceState', {
        configurable: true,
        value: throwingReplace,
      });
      const captured: UseTrailResult[] = [];
      try {
        render(<Probe syncToUrl onResult={(r) => captured.push(r)} />);
        // The push should still update React state even if the URL write throws.
        act(() => {
          lastResult(captured).push({ label: 'Charges' });
        });
        expect(lastResult(captured).trail).toEqual([{ label: 'Charges' }]);
      } finally {
        Object.defineProperty(window.history, 'replaceState', {
          configurable: true,
          value: originalReplace,
        });
      }
    });
  });
});
