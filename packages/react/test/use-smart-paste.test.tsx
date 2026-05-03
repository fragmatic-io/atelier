// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import {
  detectFirstUrl,
  useSmartPaste,
  type EmbedDisplay,
  type EmbedRegistry,
  type PasteEvent,
  type SmartPasteOptions,
  type UseSmartPasteResult,
} from '../src/hooks/use-smart-paste.js';

/**
 * Minimal fake `EmbedRegistry` — `resolve` returns whatever the test
 * scripted, optionally after a delay. Mirrors the surface
 * `useSmartPaste` consumes.
 */
interface FakeRegistryScript {
  /** When set, `resolve` resolves to this payload. */
  display?: EmbedDisplay;
  /** When set, `resolve` resolves to null. */
  unresolved?: boolean;
  /** When set, `resolve` rejects. */
  reject?: boolean;
  /** Optional delay before resolving / rejecting. */
  delayMs?: number;
}

function makeRegistry(script: FakeRegistryScript): EmbedRegistry & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolve(url: string) {
      calls.push(url);
      const make = (): Promise<{ provider: string; display: EmbedDisplay } | null> => {
        if (script.reject === true) return Promise.reject(new Error('boom'));
        if (script.unresolved === true) return Promise.resolve(null);
        if (script.display !== undefined) {
          return Promise.resolve({ provider: 'fake', display: script.display });
        }
        return Promise.resolve(null);
      };
      if (script.delayMs === undefined || script.delayMs <= 0) return make();
      return new Promise<{ provider: string; display: EmbedDisplay } | null>((resolve, reject) => {
        setTimeout(() => {
          make().then(resolve, reject);
        }, script.delayMs);
      });
    },
  };
}

interface ProbeProps {
  options: SmartPasteOptions;
  onResult: (r: UseSmartPasteResult) => void;
}

function Probe({ options, onResult }: ProbeProps): ReactElement {
  const result = useSmartPaste(options);
  useEffect(() => {
    onResult(result);
  });
  return <div data-testid="probe" />;
}

function lastResult(captured: UseSmartPasteResult[]): UseSmartPasteResult {
  const last = captured[captured.length - 1];
  if (last === undefined) throw new Error('hook never produced a result');
  return last;
}

/**
 * Build a synthetic paste event that mirrors the React clipboard event
 * surface enough for the hook (it only reads `clipboardData.getData`).
 */
function pasteEventWithText(text: string): React.ClipboardEvent {
  return {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  } as unknown as React.ClipboardEvent;
}

function pasteEventWithoutClipboard(): React.ClipboardEvent {
  return { clipboardData: null } as unknown as React.ClipboardEvent;
}

describe('detectFirstUrl', () => {
  it('extracts an http URL from prose', () => {
    expect(detectFirstUrl('see http://example.com for more')).toBe('http://example.com');
  });

  it('extracts an https URL from prose', () => {
    expect(detectFirstUrl('hi https://youtu.be/abc here')).toBe('https://youtu.be/abc');
  });

  it('strips trailing punctuation', () => {
    expect(detectFirstUrl('check https://example.com.')).toBe('https://example.com');
    expect(detectFirstUrl('here: https://example.com,')).toBe('https://example.com');
    expect(detectFirstUrl('really? https://example.com?')).toBe('https://example.com');
  });

  it('strips an unmatched trailing close-paren', () => {
    expect(detectFirstUrl('see (https://example.com)')).toBe('https://example.com');
  });

  it('keeps balanced parens inside the URL', () => {
    expect(detectFirstUrl('see https://en.wikipedia.org/wiki/foo_(bar)')).toBe(
      'https://en.wikipedia.org/wiki/foo_(bar)',
    );
  });

  it('returns null when no URL is present', () => {
    expect(detectFirstUrl('hello world')).toBeNull();
    expect(detectFirstUrl('')).toBeNull();
  });

  it('returns the FIRST URL only', () => {
    expect(detectFirstUrl('one https://a.com two https://b.com')).toBe('https://a.com');
  });

  it('does not match javascript: schemes', () => {
    expect(detectFirstUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('useSmartPaste', () => {
  describe('URL detection + resolution', () => {
    it('detects URL, resolves through registry, fires onPaste with display', async () => {
      const display: EmbedDisplay = { kind: 'video', iframeSrc: 'https://x/embed' };
      const registry = makeRegistry({ display });
      const events: PasteEvent[] = [];
      const captured: UseSmartPasteResult[] = [];
      render(
        <Probe
          options={{ embedRegistry: registry, onPaste: (e) => events.push(e) }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithText('hi https://example.com here'));
      // Microtask flush — sync resolvers (and our mock) settle on the
      // next tick.
      await Promise.resolve();
      await Promise.resolve();
      expect(registry.calls).toEqual(['https://example.com']);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        text: 'hi https://example.com here',
        unfurled: { url: 'https://example.com', display },
      });
    });

    it('falls back to raw text on registry timeout', async () => {
      vi.useFakeTimers();
      try {
        const display: EmbedDisplay = { kind: 'card', title: 'late' };
        // 100ms delay > 50ms timeout → fallback fires.
        const registry = makeRegistry({ display, delayMs: 100 });
        const events: PasteEvent[] = [];
        const captured: UseSmartPasteResult[] = [];
        render(
          <Probe
            options={{
              embedRegistry: registry,
              onPaste: (e) => events.push(e),
              unfurlTimeoutMs: 50,
            }}
            onResult={(r) => captured.push(r)}
          />,
        );
        lastResult(captured).onPasteHandler(pasteEventWithText('https://slow.example.com'));
        // Advance past the timeout but before the registry settles.
        await vi.advanceTimersByTimeAsync(50);
        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({ text: 'https://slow.example.com' });
        // Even after the registry eventually resolves, we don't re-fire.
        await vi.advanceTimersByTimeAsync(200);
        expect(events).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('falls back to raw text when registry returns null', async () => {
      const registry = makeRegistry({ unresolved: true });
      const events: PasteEvent[] = [];
      const captured: UseSmartPasteResult[] = [];
      render(
        <Probe
          options={{ embedRegistry: registry, onPaste: (e) => events.push(e) }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithText('https://nope.example.com'));
      await Promise.resolve();
      await Promise.resolve();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ text: 'https://nope.example.com' });
      expect(events[0]?.unfurled).toBeUndefined();
    });

    it('falls back to raw text when registry rejects', async () => {
      const registry = makeRegistry({ reject: true });
      const events: PasteEvent[] = [];
      const captured: UseSmartPasteResult[] = [];
      render(
        <Probe
          options={{ embedRegistry: registry, onPaste: (e) => events.push(e) }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithText('https://boom.example.com'));
      await Promise.resolve();
      await Promise.resolve();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ text: 'https://boom.example.com' });
    });
  });

  describe('no URL / no clipboard', () => {
    it('fires onPaste with raw text when no URL is in the clipboard', () => {
      const registry = makeRegistry({ display: { kind: 'card', title: 'never' } });
      const events: PasteEvent[] = [];
      const captured: UseSmartPasteResult[] = [];
      render(
        <Probe
          options={{ embedRegistry: registry, onPaste: (e) => events.push(e) }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithText('hello world no urls here'));
      expect(registry.calls).toEqual([]);
      expect(events).toEqual([{ text: 'hello world no urls here' }]);
    });

    it('fires onPaste with empty text when clipboard is empty', () => {
      const registry = makeRegistry({});
      const events: PasteEvent[] = [];
      const captured: UseSmartPasteResult[] = [];
      render(
        <Probe
          options={{ embedRegistry: registry, onPaste: (e) => events.push(e) }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithText(''));
      expect(events).toEqual([{ text: '' }]);
    });

    it('fires onPaste with empty text when clipboardData is null', () => {
      const registry = makeRegistry({});
      const events: PasteEvent[] = [];
      const captured: UseSmartPasteResult[] = [];
      render(
        <Probe
          options={{ embedRegistry: registry, onPaste: (e) => events.push(e) }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithoutClipboard());
      expect(events).toEqual([{ text: '' }]);
    });
  });

  describe('opt-out paths', () => {
    it('skips unfurl when unfurlTimeoutMs <= 0', () => {
      const registry = makeRegistry({ display: { kind: 'card', title: 'never' } });
      const events: PasteEvent[] = [];
      const captured: UseSmartPasteResult[] = [];
      render(
        <Probe
          options={{
            embedRegistry: registry,
            onPaste: (e) => events.push(e),
            unfurlTimeoutMs: 0,
          }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithText('https://example.com'));
      expect(registry.calls).toEqual([]);
      expect(events).toEqual([{ text: 'https://example.com' }]);
    });
  });

  describe('handler stability + ref tracking', () => {
    it('returns a stable handler across re-renders', () => {
      const registry = makeRegistry({});
      const captured: UseSmartPasteResult[] = [];
      const { rerender } = render(
        <Probe
          options={{ embedRegistry: registry, onPaste: () => undefined }}
          onResult={(r) => captured.push(r)}
        />,
      );
      const first = lastResult(captured).onPasteHandler;
      rerender(
        <Probe
          options={{
            embedRegistry: registry,
            onPaste: () => undefined,
            unfurlTimeoutMs: 999, // change a prop
          }}
          onResult={(r) => captured.push(r)}
        />,
      );
      const second = lastResult(captured).onPasteHandler;
      expect(second).toBe(first);
    });

    it('uses the latest onPaste callback after a re-render', () => {
      const registry = makeRegistry({});
      const captured: UseSmartPasteResult[] = [];
      const firstSpy = vi.fn();
      const secondSpy = vi.fn();
      const { rerender } = render(
        <Probe
          options={{ embedRegistry: registry, onPaste: firstSpy }}
          onResult={(r) => captured.push(r)}
        />,
      );
      rerender(
        <Probe
          options={{ embedRegistry: registry, onPaste: secondSpy }}
          onResult={(r) => captured.push(r)}
        />,
      );
      lastResult(captured).onPasteHandler(pasteEventWithText('plain text'));
      expect(firstSpy).not.toHaveBeenCalled();
      expect(secondSpy).toHaveBeenCalledOnce();
    });
  });

  describe('binding to a real DOM node', () => {
    it('fires when a paste event hits the bound element', async () => {
      const display: EmbedDisplay = { kind: 'card', title: 'OK' };
      const registry = makeRegistry({ display });
      const events: PasteEvent[] = [];

      function Host(): ReactElement {
        const { onPasteHandler } = useSmartPaste({
          embedRegistry: registry,
          onPaste: (e) => events.push(e),
        });
        return (
          <div
            data-testid="surface"
            contentEditable
            suppressContentEditableWarning
            onPaste={onPasteHandler}
          />
        );
      }

      const { getByTestId } = render(<Host />);
      const node = getByTestId('surface');
      // Simulate a paste with text/plain via the React clipboard event API.
      fireEvent.paste(node, {
        clipboardData: { getData: (t: string) => (t === 'text/plain' ? 'see https://x.io' : '') },
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(registry.calls).toEqual(['https://x.io']);
      expect(events).toHaveLength(1);
      expect(events[0]?.unfurled?.url).toBe('https://x.io');
    });
  });
});

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
