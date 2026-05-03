// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';

import { useScrollRestore } from '../src/hooks/use-scroll-restore.js';

interface ProbeProps {
  routeKey: string;
  scope?: 'session' | 'local';
  onMount?: (el: HTMLElement) => void;
}

/**
 * A simple scrollable container probe. We expose the underlying element
 * via `onMount` so tests can drive `scrollTop` and dispatch `scroll`
 * events directly — happy-dom doesn't simulate layout, so we cannot rely
 * on real scrolling.
 */
function Probe({ routeKey, scope, onMount }: ProbeProps): ReactElement {
  const ref = useRef<HTMLElement | null>(null);
  // Build options conditionally for `exactOptionalPropertyTypes: true`.
  const opts: Parameters<typeof useScrollRestore>[0] = {
    containerRef: ref,
    routeKey,
  };
  if (scope !== undefined) opts.scope = scope;
  useScrollRestore(opts);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el !== null && onMount !== undefined) onMount(el);
      }}
      data-testid="scroll-container"
      style={{ overflow: 'auto', height: 200 }}
    >
      <div style={{ height: 5000 }}>tall content</div>
    </div>
  );
}

function dispatchScroll(el: HTMLElement, top: number): void {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
}

describe('useScrollRestore — record + restore', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('records scrollTop on the scroll event under `${routeKey}.scroll`', () => {
    let captured: HTMLElement | null = null;
    render(
      <Probe
        routeKey="/inbox"
        onMount={(el) => {
          captured = el;
        }}
      />,
    );
    expect(captured).not.toBeNull();
    act(() => {
      dispatchScroll(captured as unknown as HTMLElement, 420);
    });
    expect(window.sessionStorage.getItem('/inbox.scroll')).toBe('420');
  });

  it('restores scrollTop on remount', () => {
    let firstEl: HTMLElement | null = null;
    const { unmount } = render(
      <Probe
        routeKey="/inbox"
        onMount={(el) => {
          firstEl = el;
        }}
      />,
    );
    act(() => {
      dispatchScroll(firstEl as unknown as HTMLElement, 1234);
    });
    unmount();

    let secondEl: HTMLElement | null = null;
    render(
      <Probe
        routeKey="/inbox"
        onMount={(el) => {
          secondEl = el;
        }}
      />,
    );
    expect(secondEl).not.toBeNull();
    expect((secondEl as unknown as HTMLElement).scrollTop).toBe(1234);
  });

  it('does NOT restore when no scroll has been recorded', () => {
    let el: HTMLElement | null = null;
    render(
      <Probe
        routeKey="/fresh"
        onMount={(node) => {
          el = node;
        }}
      />,
    );
    expect((el as unknown as HTMLElement).scrollTop).toBe(0);
  });

  it('different routeKeys do not collide', () => {
    let inboxEl: HTMLElement | null = null;
    let projectsEl: HTMLElement | null = null;
    render(
      <Probe
        routeKey="/inbox"
        onMount={(el) => {
          inboxEl = el;
        }}
      />,
    );
    render(
      <Probe
        routeKey="/projects"
        onMount={(el) => {
          projectsEl = el;
        }}
      />,
    );
    act(() => {
      dispatchScroll(inboxEl as unknown as HTMLElement, 800);
    });
    expect(window.sessionStorage.getItem('/inbox.scroll')).toBe('800');
    expect(window.sessionStorage.getItem('/projects.scroll')).toBeNull();
    // The other route's container stays at 0 — no cross-talk.
    expect((projectsEl as unknown as HTMLElement).scrollTop).toBe(0);
  });

  it('persists separately from `useViewState`s `${routeKey}.view` slot', () => {
    let el: HTMLElement | null = null;
    render(
      <Probe
        routeKey="/co-route"
        onMount={(node) => {
          el = node;
        }}
      />,
    );
    act(() => {
      dispatchScroll(el as unknown as HTMLElement, 600);
    });
    expect(window.sessionStorage.getItem('/co-route.scroll')).toBe('600');
    expect(window.sessionStorage.getItem('/co-route.view')).toBeNull();
  });

  it('honours scope=local', () => {
    let el: HTMLElement | null = null;
    render(
      <Probe
        routeKey="/local-scope"
        scope="local"
        onMount={(node) => {
          el = node;
        }}
      />,
    );
    act(() => {
      dispatchScroll(el as unknown as HTMLElement, 222);
    });
    expect(window.localStorage.getItem('/local-scope.scroll')).toBe('222');
    expect(window.sessionStorage.getItem('/local-scope.scroll')).toBeNull();
  });
});

describe('useScrollRestore — SSR safety', () => {
  it('does not throw during server render (no window, no ref)', () => {
    const originalWindow = globalThis.window as unknown;
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });
    try {
      const out = renderToString(<Probe routeKey="/ssr-scroll" />);
      // Sanity: rendered the container; the hook's effects don't run on
      // the server.
      expect(out).toContain('scroll-container');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });
});

describe('useScrollRestore — null container', () => {
  it('no-ops cleanly when the ref never attaches', () => {
    function NullRefProbe(): ReactElement {
      const ref = useRef<HTMLElement | null>(null);
      useScrollRestore({
        containerRef: ref,
        routeKey: '/null-ref',
      });
      // Deliberately do NOT attach the ref to any element.
      return <div data-testid="no-attach" />;
    }
    expect(() => render(<NullRefProbe />)).not.toThrow();
    // Nothing is recorded because there's no container to listen on.
    expect(window.sessionStorage.getItem('/null-ref.scroll')).toBeNull();
  });
});
