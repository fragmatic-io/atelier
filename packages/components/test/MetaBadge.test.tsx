// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MetaBadge, MetaBadgeBinding, metaBadgeTextRender } from '../src/components/MetaBadge.js';

describe('MetaBadge', () => {
  it('binding id matches', () => {
    expect(MetaBadgeBinding.id).toBe('MetaBadge');
  });

  it('renders with default variant when no variant is supplied', () => {
    const { container } = render(<MetaBadge label="API" />);
    const root = container.querySelector('[data-cir-component="MetaBadge"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-variant')).toBe('default');
  });

  it('reflects each variant on data-variant', () => {
    for (const variant of ['default', 'info', 'success', 'warning', 'danger', 'live'] as const) {
      const { container, unmount } = render(<MetaBadge label="x" variant={variant} />);
      expect(
        container.querySelector('[data-cir-component="MetaBadge"]')?.getAttribute('data-variant'),
      ).toBe(variant);
      unmount();
    }
  });

  it('renders count alone when only count is supplied', () => {
    const { container } = render(<MetaBadge count={5} />);
    const content = container.querySelector('[data-cir-part="metabadge-content"]');
    expect(content?.textContent).toBe('5');
  });

  it('renders label alone when only label is supplied', () => {
    const { container } = render(<MetaBadge label="unread" />);
    const content = container.querySelector('[data-cir-part="metabadge-content"]');
    expect(content?.textContent).toBe('unread');
  });

  it('renders `${count} ${label}` when both are supplied', () => {
    const { container } = render(<MetaBadge count={5} label="unread" />);
    const content = container.querySelector('[data-cir-part="metabadge-content"]');
    expect(content?.textContent).toBe('5 unread');
  });

  it('handles count=0 (falsy but valid) by rendering "0"', () => {
    const { container } = render(<MetaBadge count={0} />);
    const content = container.querySelector('[data-cir-part="metabadge-content"]');
    expect(content?.textContent).toBe('0');
  });

  it('renders a leading dot when dot=true', () => {
    const { container } = render(<MetaBadge label="live" variant="live" dot />);
    const dotEl = container.querySelector('[data-cir-part="metabadge-dot"]');
    expect(dotEl).toBeTruthy();
    expect(dotEl?.getAttribute('aria-hidden')).toBe('true');
    const root = container.querySelector('[data-cir-component="MetaBadge"]');
    expect(root?.getAttribute('data-dot')).toBe('true');
  });

  it('omits the dot element when dot is false (default)', () => {
    const { container } = render(<MetaBadge label="API" />);
    expect(container.querySelector('[data-cir-part="metabadge-dot"]')).toBeNull();
  });

  it('renders just the dot when dot=true and no label/count', () => {
    const { container } = render(<MetaBadge dot variant="live" />);
    expect(container.querySelector('[data-cir-part="metabadge-dot"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-part="metabadge-content"]')).toBeNull();
  });

  it('returns null when neither label/count nor dot is supplied', () => {
    const { container } = render(<MetaBadge />);
    expect(container.querySelector('[data-cir-component="MetaBadge"]')).toBeNull();
  });

  it('returns null on empty-string label with no count and no dot', () => {
    const { container } = render(<MetaBadge label="" />);
    expect(container.querySelector('[data-cir-component="MetaBadge"]')).toBeNull();
  });

  it('forwards className alongside variant utilities', () => {
    const { container } = render(<MetaBadge label="x" className="custom-extra" />);
    const root = container.querySelector('[data-cir-component="MetaBadge"]');
    expect(root?.className).toContain('custom-extra');
  });

  it('text-render formats count, label, both, or empty', () => {
    expect(metaBadgeTextRender({ count: 5, label: 'unread' })).toBe('[MetaBadge: 5 unread]');
    expect(metaBadgeTextRender({ count: 12 })).toBe('[MetaBadge: 12]');
    expect(metaBadgeTextRender({ label: 'API' })).toBe('[MetaBadge: API]');
    expect(metaBadgeTextRender({})).toBe('[MetaBadge]');
    expect(metaBadgeTextRender({ count: 0 })).toBe('[MetaBadge: 0]');
  });
});
