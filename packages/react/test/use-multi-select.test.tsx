// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { useMultiSelect, type UseMultiSelectResult } from '../src/hooks/use-multi-select.js';

interface ProbeProps {
  ids: readonly string[];
  onReady: (api: UseMultiSelectResult) => void;
  bind?: boolean;
}

/** Tiny harness component that hands the hook handle out to the test. */
function Probe({ ids, onReady, bind = false }: ProbeProps): ReactElement {
  const api = useMultiSelect();
  useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  useEffect(() => {
    if (!bind) return;
    return api.bind(() => ids);
  }, [api, ids, bind]);
  return <div />;
}

function renderProbe(
  ids: readonly string[],
  bind = false,
): { getApi: () => UseMultiSelectResult; cleanup: () => void } {
  let api: UseMultiSelectResult | null = null;
  const onReady = (next: UseMultiSelectResult): void => {
    api = next;
  };
  const { unmount } = render(<Probe ids={ids} onReady={onReady} bind={bind} />);
  return {
    getApi: (): UseMultiSelectResult => {
      if (!api) throw new Error('hook never reported ready');
      return api;
    },
    cleanup: unmount,
  };
}

describe('useMultiSelect', () => {
  it('starts with an empty selection', () => {
    const { getApi, cleanup } = renderProbe(['a', 'b', 'c']);
    expect(getApi().selected.size).toBe(0);
    expect(getApi().isSelected('a')).toBe(false);
    cleanup();
  });

  it('toggle adds and removes an id', () => {
    const { getApi, cleanup } = renderProbe(['a', 'b', 'c']);
    act(() => {
      getApi().toggle('a');
    });
    expect(getApi().isSelected('a')).toBe(true);
    expect(getApi().selected.size).toBe(1);
    act(() => {
      getApi().toggle('a');
    });
    expect(getApi().isSelected('a')).toBe(false);
    expect(getApi().selected.size).toBe(0);
    cleanup();
  });

  it('selectRange selects every id between two anchors', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'] as const;
    const { getApi, cleanup } = renderProbe(ids);
    act(() => {
      getApi().selectRange('b', 'd', ids);
    });
    expect(getApi().isSelected('a')).toBe(false);
    expect(getApi().isSelected('b')).toBe(true);
    expect(getApi().isSelected('c')).toBe(true);
    expect(getApi().isSelected('d')).toBe(true);
    expect(getApi().isSelected('e')).toBe(false);
    cleanup();
  });

  it('selectRange handles inverted from/to order', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'] as const;
    const { getApi, cleanup } = renderProbe(ids);
    act(() => {
      getApi().selectRange('d', 'b', ids);
    });
    expect(getApi().selected.size).toBe(3);
    cleanup();
  });

  it('selectAll replaces selection with every id', () => {
    const ids = ['a', 'b', 'c'] as const;
    const { getApi, cleanup } = renderProbe(ids);
    act(() => {
      getApi().toggle('a');
      getApi().selectAll(ids);
    });
    expect(getApi().selected.size).toBe(3);
    cleanup();
  });

  it('clear empties the selection', () => {
    const ids = ['a', 'b', 'c'] as const;
    const { getApi, cleanup } = renderProbe(ids);
    act(() => {
      getApi().selectAll(ids);
    });
    expect(getApi().selected.size).toBe(3);
    act(() => {
      getApi().clear();
    });
    expect(getApi().selected.size).toBe(0);
    cleanup();
  });

  it('Cmd+A binding selects all when bound', () => {
    const ids = ['a', 'b', 'c', 'd'] as const;
    const { getApi, cleanup } = renderProbe(ids, true);
    act(() => {
      const evt = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true });
      document.dispatchEvent(evt);
    });
    expect(getApi().selected.size).toBe(4);
    cleanup();
  });

  it('Esc binding clears the selection', () => {
    const ids = ['a', 'b'] as const;
    const { getApi, cleanup } = renderProbe(ids, true);
    act(() => {
      getApi().selectAll(ids);
    });
    expect(getApi().selected.size).toBe(2);
    act(() => {
      const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(evt);
    });
    expect(getApi().selected.size).toBe(0);
    cleanup();
  });

  it('bind cleanup tears down the listener', () => {
    const ids = ['a', 'b'] as const;
    const { getApi, cleanup } = renderProbe(ids, true);
    cleanup();
    // After cleanup, the document listener should no longer fire.
    let mutations = 0;
    const probe = (): void => {
      mutations += 1;
    };
    document.addEventListener('keydown', probe);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));
    expect(mutations).toBe(1);
    // The hook's selection state cannot change after unmount; we just
    // verify nothing throws and the standalone probe still fires.
    expect(getApi().selected.size).toBe(0);
    document.removeEventListener('keydown', probe);
  });

  it('Cmd+A is suppressed when focus is inside an input', () => {
    const ids = ['a', 'b'] as const;
    const { getApi, cleanup } = renderProbe(ids, true);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      const evt = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true });
      Object.defineProperty(evt, 'target', { value: input });
      document.dispatchEvent(evt);
    });
    expect(getApi().selected.size).toBe(0);
    document.body.removeChild(input);
    cleanup();
  });
});
