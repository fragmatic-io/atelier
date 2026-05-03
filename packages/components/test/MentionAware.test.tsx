// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MentionAware } from '../src/components/MentionAware.js';
import { combineMentionResolvers, type MentionResolver } from '../src/mentions/resolver.js';

const userResolver: MentionResolver = {
  prefixes: ['@'],
  resolve: (m) =>
    m.id === 'alice'
      ? { label: 'Alice', className: 'mention-user' }
      : m.id === 'bob'
        ? { label: 'Bob' }
        : null,
};

const issueResolver: MentionResolver = {
  prefixes: ['#'],
  resolve: (m) => ({
    label: m.id,
    href: `https://issues.example.com/${m.id}`,
    className: 'mention-issue',
  }),
};

describe('MentionAware', () => {
  it('renders plain text unchanged when there are no mentions', () => {
    const { container } = render(<MentionAware text="just plain prose" resolver={userResolver} />);
    expect(container.textContent).toBe('just plain prose');
    expect(container.querySelectorAll('[data-cir-component="Mention"]')).toHaveLength(0);
  });

  it('renders a mix of mentions and literals in source order', () => {
    const combined = combineMentionResolvers([userResolver, issueResolver]);
    const { container } = render(
      <MentionAware text="hi @alice see #ENG-123 cc @bob" resolver={combined} />,
    );
    const chips = container.querySelectorAll('[data-cir-component="Mention"]');
    expect(chips).toHaveLength(3);
    expect(chips[0]?.textContent).toBe('Alice');
    expect(chips[0]?.getAttribute('data-prefix')).toBe('@');
    expect(chips[1]?.tagName).toBe('A');
    expect(chips[1]?.getAttribute('data-prefix')).toBe('#');
    expect(chips[1]?.getAttribute('href')).toBe('https://issues.example.com/ENG-123');
    expect(chips[2]?.textContent).toBe('Bob');
    // The combined output text reads as the human would read it.
    expect(container.textContent).toBe('hi Alice see ENG-123 cc Bob');
  });

  it('falls back to raw text when the resolver returns null for an id', () => {
    const { container } = render(
      <MentionAware text="cc @alice and @nobody" resolver={userResolver} />,
    );
    const chips = container.querySelectorAll('[data-cir-component="Mention"]');
    expect(chips).toHaveLength(2);
    expect(chips[0]?.getAttribute('data-cir-state')).toBe('resolved');
    expect(chips[0]?.textContent).toBe('Alice');
    expect(chips[1]?.getAttribute('data-cir-state')).toBe('unresolved');
    expect(chips[1]?.textContent).toBe('@nobody');
  });

  it('does not parse `noreply@example.com` as @example', () => {
    const { container } = render(
      <MentionAware text="contact noreply@example.com for support" resolver={userResolver} />,
    );
    expect(container.querySelectorAll('[data-cir-component="Mention"]')).toHaveLength(0);
    expect(container.textContent).toBe('contact noreply@example.com for support');
  });

  it('renders nothing extra for an empty `text`', () => {
    const { container } = render(<MentionAware text="" resolver={userResolver} />);
    expect(container.textContent).toBe('');
  });

  it('keeps stable per-match keys (no console-warned duplicate keys)', () => {
    // Smoke-only: render with multiple matches and ensure no React key
    // warnings are emitted. We hook console.error and assert no calls.
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]): void => {
      errors.push(args);
    };
    try {
      render(<MentionAware text="hi @alice and @bob and @alice again" resolver={userResolver} />);
    } finally {
      console.error = original;
    }
    const keyWarnings = errors.filter((a) =>
      a.some((arg) => typeof arg === 'string' && arg.includes('unique "key"')),
    );
    expect(keyWarnings).toHaveLength(0);
  });
});
