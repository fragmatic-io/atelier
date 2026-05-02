// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icon, IconBinding, iconTextRender } from '../src/components/Icon.js';
import { IconResolverProvider, IconResolverContext } from '../src/icons/context.js';
import { IconBrandProvider } from '../src/icons/brand-context.js';
import { LiteralIconResolver, MapIconResolver } from '../src/icons/resolver.js';

const ARCHIVE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7h18"/></svg>';
const TRASH_SVG = '<svg data-name="trash"/>';

function renderWithResolver(node: React.ReactNode): ReturnType<typeof render> {
  const resolver = new LiteralIconResolver({ lucide: { archive: ARCHIVE_SVG, trash: TRASH_SVG } });
  return render(<IconResolverProvider resolver={resolver}>{node}</IconResolverProvider>);
}

describe('Icon', () => {
  it('resolves via context and injects the SVG markup', () => {
    const { container } = renderWithResolver(<Icon set="lucide" name="archive" />);
    const span = container.querySelector('[data-cir-component="Icon"]');
    expect(span).toBeTruthy();
    expect(span?.getAttribute('data-icon-set')).toBe('lucide');
    expect(span?.getAttribute('data-icon-name')).toBe('archive');
    expect(span?.querySelector('svg')).toBeTruthy();
    expect(span?.getAttribute('data-icon-missing')).toBeNull();
  });

  it('renders a layout-stable placeholder when the resolver returns null', () => {
    const { container } = renderWithResolver(<Icon set="lucide" name="does-not-exist" />);
    const span = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(span).toBeTruthy();
    expect(span?.getAttribute('data-icon-missing')).toBe('true');
    expect(span?.querySelector('svg')).toBeNull();
    // Sized to default 16px so layout is stable.
    expect(span?.style.width).toBe('16px');
    expect(span?.style.height).toBe('16px');
  });

  it('uses the default 16px size and respects custom size', () => {
    const { container, rerender } = renderWithResolver(<Icon set="lucide" name="archive" />);
    const def = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(def?.style.width).toBe('16px');
    expect(def?.style.height).toBe('16px');

    const resolver = new LiteralIconResolver({ lucide: { archive: ARCHIVE_SVG } });
    rerender(
      <IconResolverProvider resolver={resolver}>
        <Icon set="lucide" name="archive" size={32} />
      </IconResolverProvider>,
    );
    const big = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(big?.style.width).toBe('32px');
    expect(big?.style.height).toBe('32px');
  });

  it('sets role=img + aria-label when ariaLabel is provided', () => {
    const { container } = renderWithResolver(
      <Icon set="lucide" name="archive" ariaLabel="Archive item" />,
    );
    const span = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(span?.getAttribute('role')).toBe('img');
    expect(span?.getAttribute('aria-label')).toBe('Archive item');
    expect(span?.getAttribute('aria-hidden')).toBeNull();
  });

  it('sets aria-hidden=true when ariaLabel is omitted', () => {
    const { container } = renderWithResolver(<Icon set="lucide" name="archive" />);
    const span = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(span?.getAttribute('aria-hidden')).toBe('true');
    expect(span?.getAttribute('role')).toBeNull();
  });

  it('a closer IconResolverProvider overrides an outer one', () => {
    const outer = new LiteralIconResolver({ lucide: { archive: '<svg id="outer"/>' } });
    const inner = new LiteralIconResolver({ lucide: { archive: '<svg id="inner"/>' } });
    const { container } = render(
      <IconResolverProvider resolver={outer}>
        <IconResolverProvider resolver={inner}>
          <Icon set="lucide" name="archive" />
        </IconResolverProvider>
      </IconResolverProvider>,
    );
    expect(container.querySelector('svg')?.getAttribute('id')).toBe('inner');
  });

  it('falls back to NoopIconResolver when no provider is in scope', () => {
    const { container } = render(<Icon set="lucide" name="archive" />);
    const span = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(span?.getAttribute('data-icon-missing')).toBe('true');
  });

  it('applies the strokeWidth via inline style', () => {
    const { container } = renderWithResolver(
      <Icon set="lucide" name="archive" strokeWidth={2.5} />,
    );
    const span = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(span?.style.strokeWidth).toBe('2.5');
  });

  it('clamps size up to brand minimumSize when an IconBrandProvider is in scope', () => {
    const resolver = new MapIconResolver(new Map([['lucide:archive', ARCHIVE_SVG]]));
    const { container } = render(
      <IconBrandProvider config={{ minimumSize: 24 }}>
        <IconResolverProvider resolver={resolver}>
          <Icon set="lucide" name="archive" size={12} />
        </IconResolverProvider>
      </IconBrandProvider>,
    );
    const span = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    // 12 is clamped up to 24 by brand minimum.
    expect(span?.style.width).toBe('24px');
    expect(span?.style.height).toBe('24px');
  });

  it('does not clamp when size already exceeds the brand minimumSize', () => {
    const resolver = new MapIconResolver(new Map([['lucide:archive', ARCHIVE_SVG]]));
    const { container } = render(
      <IconBrandProvider config={{ minimumSize: 16 }}>
        <IconResolverProvider resolver={resolver}>
          <Icon set="lucide" name="archive" size={32} />
        </IconResolverProvider>
      </IconBrandProvider>,
    );
    const span = container.querySelector<HTMLElement>('[data-cir-component="Icon"]');
    expect(span?.style.width).toBe('32px');
  });

  it('honours className on both the placeholder and rendered span', () => {
    const { container, rerender } = renderWithResolver(
      <Icon set="lucide" name="missing" className="my-icon" />,
    );
    expect(container.querySelector('.my-icon')?.getAttribute('data-icon-missing')).toBe('true');

    rerender(
      <IconResolverProvider
        resolver={new LiteralIconResolver({ lucide: { archive: ARCHIVE_SVG } })}
      >
        <Icon set="lucide" name="archive" className="my-icon" />
      </IconResolverProvider>,
    );
    expect(container.querySelector('.my-icon')?.querySelector('svg')).toBeTruthy();
  });

  it('IconResolverContext default is the no-op resolver', () => {
    // The context export must be non-null for the runtime adapter.
    expect(IconResolverContext).toBeDefined();
  });

  it('binding id matches', () => {
    expect(IconBinding.id).toBe('Icon');
  });

  it('iconTextRender renders [icon: <set>:<name>]', () => {
    expect(iconTextRender({ set: 'lucide', name: 'archive' })).toBe('[icon: lucide:archive]');
  });

  it('iconTextRender handles partial props with `?` fallbacks', () => {
    expect(iconTextRender({})).toBe('[icon: ?:?]');
    expect(iconTextRender({ set: 'lucide' })).toBe('[icon: lucide:?]');
  });
});
