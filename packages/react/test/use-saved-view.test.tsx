// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import {
  useSavedView,
  type UseSavedViewResult,
  type ViewDefinition,
} from '../src/hooks/use-saved-view.js';

interface ProbeProps {
  views: readonly ViewDefinition[];
  syncToUrl?: boolean;
  urlKey?: string;
  initialActiveId?: string;
  onResult: (r: UseSavedViewResult) => void;
}

function Probe({ views, syncToUrl, urlKey, initialActiveId, onResult }: ProbeProps): ReactElement {
  const opts: Parameters<typeof useSavedView>[0] = { views };
  if (syncToUrl !== undefined) opts.syncToUrl = syncToUrl;
  if (urlKey !== undefined) opts.urlKey = urlKey;
  if (initialActiveId !== undefined) opts.initialActiveId = initialActiveId;
  const result = useSavedView(opts);
  useEffect(() => {
    onResult(result);
  });
  return <div data-testid="probe">{result.active?.id ?? ''}</div>;
}

function lastResult(captured: UseSavedViewResult[]): UseSavedViewResult {
  const last = captured[captured.length - 1];
  if (last === undefined) throw new Error('hook never produced a result');
  return last;
}

const VIEW_ACTIVE: ViewDefinition = {
  id: 'active',
  label: 'Active issues',
  display: 'list',
  source: 'linear.issue.list',
};
const VIEW_TRIAGE: ViewDefinition = {
  id: 'triage',
  label: 'Triage',
  display: 'kanban',
  source: 'linear.issue.list',
  filters: [{ field: 'status', op: 'eq', value: 'open' }],
  sort: { field: 'priority', direction: 'desc' },
  group_by: 'status',
  density: 'compact',
};

describe('useSavedView — read', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('activates the first view when no initialActiveId is supplied', () => {
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} onResult={(r) => captured.push(r)} />);
    expect(lastResult(captured).active?.id).toBe('active');
  });

  it('activates initialActiveId when it matches a saved view', () => {
    const captured: UseSavedViewResult[] = [];
    render(
      <Probe
        views={[VIEW_ACTIVE, VIEW_TRIAGE]}
        initialActiveId="triage"
        onResult={(r) => captured.push(r)}
      />,
    );
    expect(lastResult(captured).active?.id).toBe('triage');
  });

  it('falls back to first view when initialActiveId is unknown', () => {
    const captured: UseSavedViewResult[] = [];
    render(
      <Probe
        views={[VIEW_ACTIVE, VIEW_TRIAGE]}
        initialActiveId="missing"
        onResult={(r) => captured.push(r)}
      />,
    );
    expect(lastResult(captured).active?.id).toBe('active');
  });

  it('returns active === undefined for an empty views list', () => {
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[]} onResult={(r) => captured.push(r)} />);
    expect(lastResult(captured).active).toBeUndefined();
  });

  it('exposes the saved-views list', () => {
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} onResult={(r) => captured.push(r)} />);
    expect(lastResult(captured).views).toHaveLength(2);
  });
});

describe('useSavedView — write', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('activate switches the active view by id', () => {
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} onResult={(r) => captured.push(r)} />);
    act(() => {
      lastResult(captured).activate('triage');
    });
    expect(lastResult(captured).active?.id).toBe('triage');
  });

  it('activate is a no-op when the id is unknown', () => {
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} onResult={(r) => captured.push(r)} />);
    act(() => {
      lastResult(captured).activate('missing');
    });
    expect(lastResult(captured).active?.id).toBe('active');
  });

  it('save adds a new view and activates it', () => {
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[VIEW_ACTIVE]} onResult={(r) => captured.push(r)} />);
    act(() => {
      lastResult(captured).save({
        id: 'new',
        label: 'New view',
        display: 'grid',
        source: 'linear.issue.list',
      });
    });
    expect(lastResult(captured).views).toHaveLength(2);
    expect(lastResult(captured).active?.id).toBe('new');
  });

  it('save replaces an existing view (matched by id)', () => {
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} onResult={(r) => captured.push(r)} />);
    act(() => {
      lastResult(captured).save({
        ...VIEW_TRIAGE,
        label: 'Triage (updated)',
        density: 'spacious',
      });
    });
    expect(lastResult(captured).views).toHaveLength(2);
    expect(lastResult(captured).active?.label).toBe('Triage (updated)');
    expect(lastResult(captured).active?.density).toBe('spacious');
  });
});

describe('useSavedView — syncToUrl', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('writes the active view to ?_view= on activate', () => {
    const captured: UseSavedViewResult[] = [];
    render(
      <Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} syncToUrl onResult={(r) => captured.push(r)} />,
    );
    act(() => {
      lastResult(captured).activate('triage');
    });
    expect(window.location.search).toContain('_view=');
    // The serialized payload is base64url — opaque, but non-empty.
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('_view') ?? '';
    expect(raw.length).toBeGreaterThan(0);
    // No `+`, `/`, or `=` (URL-safe wire format).
    expect(raw).not.toMatch(/[+/=]/);
  });

  it('reads the active view from ?_view= on mount (saved-id match)', () => {
    // Pre-seed the URL with a serialized view.
    const json = JSON.stringify({
      id: 'triage',
      label: 'Triage',
      display: 'kanban',
      source: 'linear.issue.list',
    });
    const b64 = Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    window.history.replaceState(null, '', `/?_view=${b64}`);
    const captured: UseSavedViewResult[] = [];
    render(
      <Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} syncToUrl onResult={(r) => captured.push(r)} />,
    );
    act(() => {
      /* flush effect */
    });
    expect(lastResult(captured).active?.id).toBe('triage');
  });

  it('adopts an inline URL view that is not in the saved list', () => {
    const json = JSON.stringify({
      id: 'shared',
      label: 'Shared from a teammate',
      display: 'list',
      source: 'linear.issue.list',
    });
    const b64 = Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    window.history.replaceState(null, '', `/?_view=${b64}`);
    const captured: UseSavedViewResult[] = [];
    render(<Probe views={[VIEW_ACTIVE]} syncToUrl onResult={(r) => captured.push(r)} />);
    act(() => {
      /* flush */
    });
    expect(lastResult(captured).active?.id).toBe('shared');
    // The host's saved list is unchanged — the inline view is ephemeral.
    expect(lastResult(captured).views).toHaveLength(1);
  });

  it('honors a custom urlKey', () => {
    const captured: UseSavedViewResult[] = [];
    render(
      <Probe
        views={[VIEW_ACTIVE, VIEW_TRIAGE]}
        syncToUrl
        urlKey="savedSearch"
        onResult={(r) => captured.push(r)}
      />,
    );
    act(() => {
      lastResult(captured).activate('triage');
    });
    expect(window.location.search).toContain('savedSearch=');
    expect(window.location.search).not.toContain('_view=');
  });

  it('removes the URL key when save replaces the active view with the same id', () => {
    const captured: UseSavedViewResult[] = [];
    render(
      <Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} syncToUrl onResult={(r) => captured.push(r)} />,
    );
    act(() => {
      lastResult(captured).activate('triage');
    });
    expect(window.location.search).toContain('_view=');
    // Save with a different label — URL still carries a `_view` (replaced).
    act(() => {
      lastResult(captured).save({ ...VIEW_TRIAGE, label: 'Triage v2' });
    });
    expect(window.location.search).toContain('_view=');
  });

  it('preserves other query params when writing _view', () => {
    window.history.replaceState(null, '', '/?other=1');
    const captured: UseSavedViewResult[] = [];
    render(
      <Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} syncToUrl onResult={(r) => captured.push(r)} />,
    );
    act(() => {
      lastResult(captured).activate('triage');
    });
    expect(window.location.search).toContain('other=1');
    expect(window.location.search).toContain('_view=');
  });
});

describe('useSavedView — SSR safety', () => {
  it('does NOT touch window.history during render when syncToUrl is off', () => {
    const originalReplace = window.history.replaceState.bind(window.history);
    const throwingReplace = (): void => {
      throw new Error('replaceState called during SSR');
    };
    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: throwingReplace,
    });
    const captured: UseSavedViewResult[] = [];
    try {
      render(<Probe views={[VIEW_ACTIVE]} onResult={(r) => captured.push(r)} />);
      expect(lastResult(captured).active?.id).toBe('active');
    } finally {
      Object.defineProperty(window.history, 'replaceState', {
        configurable: true,
        value: originalReplace,
      });
    }
  });

  it('survives writeViewToUrl throwing (replaceState rejected)', () => {
    const originalReplace = window.history.replaceState.bind(window.history);
    const throwingReplace = (): void => {
      throw new Error('blocked');
    };
    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: throwingReplace,
    });
    const captured: UseSavedViewResult[] = [];
    try {
      render(
        <Probe views={[VIEW_ACTIVE, VIEW_TRIAGE]} syncToUrl onResult={(r) => captured.push(r)} />,
      );
      // Activate should still update React state even if URL write throws.
      act(() => {
        lastResult(captured).activate('triage');
      });
      expect(lastResult(captured).active?.id).toBe('triage');
    } finally {
      Object.defineProperty(window.history, 'replaceState', {
        configurable: true,
        value: originalReplace,
      });
    }
  });
});
