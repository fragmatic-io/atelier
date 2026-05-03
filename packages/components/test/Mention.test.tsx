// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mention, MentionBinding } from '../src/components/Mention.js';
import type { MentionDisplay, MentionMatch, MentionResolver } from '../src/mentions/resolver.js';

const match = (prefix = '@', id = 'alice'): MentionMatch => ({
  prefix,
  id,
  raw: `${prefix}${id}`,
  offset: 0,
});

const syncResolver = (display: MentionDisplay | null): MentionResolver => ({
  prefixes: ['@'],
  resolve: () => display,
});

describe('Mention', () => {
  it('binding id matches', () => {
    expect(MentionBinding.id).toBe('Mention');
  });

  it('renders the resolved label inside a <span> when no href is supplied', () => {
    render(<Mention match={match()} resolver={syncResolver({ label: 'Alice' })} />);
    const chip = document.querySelector('[data-cir-component="Mention"]');
    expect(chip).not.toBeNull();
    expect(chip?.tagName).toBe('SPAN');
    expect(chip?.getAttribute('data-cir-state')).toBe('resolved');
    expect(chip?.getAttribute('data-prefix')).toBe('@');
    expect(chip?.textContent).toBe('Alice');
  });

  it('renders an <a href> when the resolver supplies an href', () => {
    render(
      <Mention
        match={match('#', 'ENG-123')}
        resolver={{
          prefixes: ['#'],
          resolve: (): MentionDisplay => ({
            label: 'ENG-123',
            href: 'https://linear.app/x/issue/ENG-123',
          }),
        }}
      />,
    );
    const chip = document.querySelector('[data-cir-component="Mention"]') as HTMLAnchorElement;
    expect(chip.tagName).toBe('A');
    expect(chip.getAttribute('href')).toBe('https://linear.app/x/issue/ENG-123');
    expect(chip.getAttribute('data-prefix')).toBe('#');
  });

  it('forwards the resolver className to the chip', () => {
    render(
      <Mention
        match={match()}
        resolver={syncResolver({ label: 'Alice', className: 'mention-user' })}
      />,
    );
    const chip = document.querySelector('[data-cir-component="Mention"]');
    expect(chip?.classList.contains('mention-user')).toBe(true);
  });

  it('uses match.raw as the aria-label', () => {
    render(<Mention match={match('@', 'alice')} resolver={syncResolver({ label: 'Alice' })} />);
    const chip = document.querySelector('[data-cir-component="Mention"]');
    expect(chip?.getAttribute('aria-label')).toBe('@alice');
  });

  it('falls back to match.raw when the resolver returns null (unknown id)', () => {
    render(<Mention match={match()} resolver={syncResolver(null)} />);
    const chip = document.querySelector('[data-cir-component="Mention"]');
    expect(chip?.getAttribute('data-cir-state')).toBe('unresolved');
    expect(chip?.textContent).toBe('@alice');
  });

  it('falls back to a custom `fallback` ReactNode when the resolver returns null', () => {
    render(
      <Mention
        match={match()}
        resolver={syncResolver(null)}
        fallback={<em data-testid="fb">missing</em>}
      />,
    );
    expect(screen.getByTestId('fb').textContent).toBe('missing');
  });

  it('renders pending state then resolves async and swaps to the chip', async () => {
    let resolveFn: (d: MentionDisplay | null) => void = () => {
      throw new Error('not yet bound');
    };
    const promise = new Promise<MentionDisplay | null>((res) => {
      resolveFn = res;
    });
    const r: MentionResolver = {
      prefixes: ['@'],
      resolve: () => promise,
    };
    render(<Mention match={match()} resolver={r} />);
    // Pending → fallback to raw, data-cir-state=pending.
    const pending = document.querySelector('[data-cir-component="Mention"]');
    expect(pending?.getAttribute('data-cir-state')).toBe('pending');
    expect(pending?.textContent).toBe('@alice');
    // Resolve the promise.
    await act(async () => {
      resolveFn({ label: 'Alice (resolved)' });
      await promise;
    });
    const resolved = document.querySelector('[data-cir-component="Mention"]');
    expect(resolved?.getAttribute('data-cir-state')).toBe('resolved');
    expect(resolved?.textContent).toBe('Alice (resolved)');
  });

  it('falls back to raw when an async resolver rejects', async () => {
    const r: MentionResolver = {
      prefixes: ['@'],
      resolve: () => Promise.reject(new Error('directory unreachable')),
    };
    render(<Mention match={match()} resolver={r} />);
    // Allow the rejection microtask to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const chip = document.querySelector('[data-cir-component="Mention"]');
    expect(chip?.getAttribute('data-cir-state')).toBe('unresolved');
    expect(chip?.textContent).toBe('@alice');
  });

  describe('hover-card preview integration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows the resolver-supplied preview node on hover', () => {
      const display: MentionDisplay = {
        label: 'Alice',
        preview: <div data-testid="alice-card">Alice — Engineering Lead</div>,
      };
      render(<Mention match={match()} resolver={syncResolver(display)} />);
      const trigger = document.querySelector('[data-cir-component="Mention"]') as HTMLElement;
      expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      const card = document.querySelector('[data-cir-component="HoverCard"]');
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain('Alice — Engineering Lead');
      // Preview ariaLabel includes match.raw for screen-reader context.
      expect(card?.getAttribute('aria-label')).toBe('@alice preview');
    });

    it('does not wrap in HoverCard when the resolver omits a preview', () => {
      render(<Mention match={match()} resolver={syncResolver({ label: 'Alice' })} />);
      const trigger = document.querySelector('[data-cir-component="Mention"]') as HTMLElement;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
    });
  });
});
