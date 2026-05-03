// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Integration tests for `<EmptyState illustration="…">` (Wave 11 / Vis-5).
 *
 * Verifies the resolver-driven illustration slot, the ARIA-label wiring,
 * and the graceful-fallback contract when the resolver is missing or the
 * name is unknown.
 */
import '../setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { EmptyState } from '../../src/components/EmptyState.js';
import { IllustrationResolverProvider } from '../../src/illustrations/context.js';
import {
  MapIllustrationResolver,
  type IllustrationEntry,
} from '../../src/illustrations/resolver.js';
import { createDefaultIllustrationResolver } from '../../src/illustrations/builtins.js';

function withResolver(
  node: ReactNode,
  map: Record<string, IllustrationEntry>,
): ReturnType<typeof render> {
  return render(
    <IllustrationResolverProvider resolver={new MapIllustrationResolver(map)}>
      {node}
    </IllustrationResolverProvider>,
  );
}

describe('EmptyState illustration prop', () => {
  it('renders the resolved SVG inline above the title', () => {
    const { container } = withResolver(
      <EmptyState title="All caught up" illustration="inbox-zero" />,
      { 'inbox-zero': { svg: '<svg data-test="m"/>', label: 'Empty inbox' } },
    );
    const slot = container.querySelector('[data-cir-part="empty-illustration"]');
    expect(slot).toBeTruthy();
    expect(slot?.getAttribute('data-illustration-name')).toBe('inbox-zero');
    expect(slot?.querySelector('svg')).toBeTruthy();
  });

  it('applies the ARIA label when the resolver supplies one', () => {
    const { container } = withResolver(<EmptyState title="t" illustration="mascot" />, {
      mascot: { svg: '<svg/>', label: 'Friendly mascot' },
    });
    const slot = container.querySelector('[data-cir-part="empty-illustration"]');
    expect(slot?.getAttribute('role')).toBe('img');
    expect(slot?.getAttribute('aria-label')).toBe('Friendly mascot');
    expect(slot?.getAttribute('aria-hidden')).toBeNull();
  });

  it('marks the slot decorative (aria-hidden) when no label is supplied', () => {
    const { container } = withResolver(<EmptyState title="t" illustration="bare" />, {
      bare: { svg: '<svg/>' },
    });
    const slot = container.querySelector('[data-cir-part="empty-illustration"]');
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
    expect(slot?.getAttribute('role')).toBeNull();
    expect(slot?.getAttribute('aria-label')).toBeNull();
  });

  it('falls through gracefully when the resolver does not know the name', () => {
    const { container } = withResolver(<EmptyState title="t" illustration="unknown-name" />, {
      other: { svg: '<svg/>' },
    });
    expect(container.querySelector('[data-cir-part="empty-illustration"]')).toBeNull();
    // The rest of the empty state still renders.
    expect(container.querySelector('[data-cir-part="empty-title"]')?.textContent).toBe('t');
  });

  it('falls through gracefully when no resolver is in scope (NoopIllustrationResolver default)', () => {
    const { container } = render(<EmptyState title="t" illustration="inbox-zero" />);
    expect(container.querySelector('[data-cir-part="empty-illustration"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it('omits the slot when `illustration` is not set (back-compat)', () => {
    const { container } = withResolver(<EmptyState title="t" />, {
      'inbox-zero': { svg: '<svg/>' },
    });
    expect(container.querySelector('[data-cir-part="empty-illustration"]')).toBeNull();
  });

  it('uses the default size of 96px and is overrideable via `illustrationSize`', () => {
    const map = { x: { svg: '<svg/>' } };
    const { container, rerender } = withResolver(<EmptyState title="t" illustration="x" />, map);
    const slot = container.querySelector<HTMLElement>('[data-cir-part="empty-illustration"]');
    expect(slot?.style.width).toBe('96px');
    expect(slot?.style.height).toBe('96px');
    rerender(
      <IllustrationResolverProvider resolver={new MapIllustrationResolver(map)}>
        <EmptyState title="t" illustration="x" illustrationSize={48} />
      </IllustrationResolverProvider>,
    );
    const slot2 = container.querySelector<HTMLElement>('[data-cir-part="empty-illustration"]');
    expect(slot2?.style.width).toBe('48px');
  });

  it('illustration takes precedence over icon (suppresses the small hero)', () => {
    const { container } = withResolver(<EmptyState title="t" illustration="x" icon="inbox" />, {
      x: { svg: '<svg/>' },
    });
    expect(container.querySelector('[data-cir-part="empty-illustration"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-part="empty-icon"]')).toBeNull();
  });

  it('icon still renders when the illustration name is unknown (graceful demotion)', () => {
    // No matching illustration entry → illustration slot omitted, icon survives.
    // (Icon renders a placeholder span since no IconResolver is in scope; that's fine.)
    const { container } = withResolver(
      <EmptyState title="t" illustration="unknown" icon="inbox" />,
      { other: { svg: '<svg/>' } },
    );
    expect(container.querySelector('[data-cir-part="empty-illustration"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="empty-icon"]')).toBeTruthy();
  });
});

describe('EmptyState illustration via createDefaultIllustrationResolver()', () => {
  it('renders every bundled illustration name end-to-end', () => {
    const names = ['inbox-zero', 'no-results', 'error', 'loading', 'placeholder'] as const;
    for (const name of names) {
      const { container, unmount } = render(
        <IllustrationResolverProvider resolver={createDefaultIllustrationResolver()}>
          <EmptyState title="t" illustration={name} />
        </IllustrationResolverProvider>,
      );
      const slot = container.querySelector('[data-cir-part="empty-illustration"]');
      expect(slot, name).toBeTruthy();
      expect(slot?.getAttribute('data-illustration-name'), name).toBe(name);
      expect(slot?.querySelector('svg'), name).toBeTruthy();
      // Each bundled entry ships with a label → role=img.
      expect(slot?.getAttribute('role'), name).toBe('img');
      unmount();
    }
  });
});
