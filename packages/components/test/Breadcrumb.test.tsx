// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Breadcrumb, BreadcrumbBinding } from '../src/components/Breadcrumb.js';
import type { TrailSegment } from '../src/breadcrumb/trail.js';

describe('Breadcrumb', () => {
  it('renders <nav aria-label="Breadcrumb"> + ordered list', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Profile' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeTruthy();
    expect(nav.querySelector('ol')).not.toBeNull();
  });

  it('links non-final items, renders the last as a span with aria-current="page"', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Profile' },
        ]}
      />,
    );
    expect(screen.getByText('Home').tagName).toBe('A');
    expect(screen.getByText('Home').getAttribute('href')).toBe('/');
    const last = screen.getByText('Profile');
    expect(last.tagName).toBe('SPAN');
    expect(last.getAttribute('aria-current')).toBe('page');
  });

  it('does not render a separator after the last item', () => {
    const { container } = render(
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Profile' }]} />,
    );
    const separators = container.querySelectorAll('[data-cir-part="breadcrumb-separator"]');
    expect(separators.length).toBe(1);
  });

  it('renders a single-item breadcrumb as just the current page', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} />);
    expect(screen.getByText('Home').getAttribute('aria-current')).toBe('page');
  });

  it('binding id matches', () => {
    expect(BreadcrumbBinding.id).toBe('Breadcrumb');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=subtle class', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} variant="subtle" />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.getAttribute('data-variant')).toBe('subtle');
    expect(nav.className).toContain('text-gray-500');
  });
  it('reflects variant=inverse class', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} variant="inverse" />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.className).toContain('bg-gray-900');
    expect(nav.className).toContain('text-white');
  });

  // -- Nav-4 drilldown trail -------------------------------------------------
  describe('drilldown trail (Nav-4)', () => {
    const trail: readonly TrailSegment[] = [
      { label: 'Charges' },
      { label: 'ch_xxx', id: 'ch_xxx' },
      { label: 'Refund', id: 'r_yyy' },
    ];

    it('renders one item per trail segment plus a synthetic Home crown', () => {
      const { container } = render(<Breadcrumb trail={trail} onNavigate={() => undefined} />);
      const items = container.querySelectorAll('[data-cir-part="breadcrumb-item"]');
      // 1 crown + 3 segments = 4
      expect(items.length).toBe(4);
      // The mode flag is emitted so hosts can target trail-mode in CSS.
      expect(container.querySelector('[data-cir-mode="trail"]')).not.toBeNull();
    });

    it('marks the last segment with aria-current="page" and renders it as a span', () => {
      render(<Breadcrumb trail={trail} onNavigate={() => undefined} />);
      const last = screen.getByText('Refund');
      expect(last.tagName).toBe('SPAN');
      expect(last.getAttribute('aria-current')).toBe('page');
    });

    it('renders intermediate segments as buttons when onNavigate is supplied', () => {
      render(<Breadcrumb trail={trail} onNavigate={() => undefined} />);
      const middle = screen.getByText('ch_xxx');
      expect(middle.tagName).toBe('BUTTON');
    });

    it('falls back to anchors when onNavigate is omitted', () => {
      render(<Breadcrumb trail={trail} />);
      const middle = screen.getByText('ch_xxx');
      expect(middle.tagName).toBe('A');
    });

    it('fires onNavigate with the segment + index for non-current clicks', () => {
      const onNavigate = vi.fn();
      render(<Breadcrumb trail={trail} onNavigate={onNavigate} />);
      fireEvent.click(screen.getByText('ch_xxx'));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      const [seg, idx] = onNavigate.mock.calls[0] as [TrailSegment, number];
      expect(seg.label).toBe('ch_xxx');
      expect(seg.id).toBe('ch_xxx');
      expect(idx).toBe(1);
    });

    it('does not duplicate Home when the trail already starts with one', () => {
      const { container } = render(
        <Breadcrumb
          trail={[{ label: 'Home' }, { label: 'Charges' }]}
          onNavigate={() => undefined}
        />,
      );
      // Two segments, no synthetic crown.
      const items = container.querySelectorAll('[data-cir-part="breadcrumb-item"]');
      expect(items.length).toBe(2);
      const homes = screen.getAllByText('Home');
      expect(homes.length).toBe(1);
    });

    it('suppresses the Home crown when homeLabel={null}', () => {
      const { container } = render(
        <Breadcrumb trail={trail} homeLabel={null} onNavigate={() => undefined} />,
      );
      const items = container.querySelectorAll('[data-cir-part="breadcrumb-item"]');
      expect(items.length).toBe(3);
      expect(screen.queryByText('Home')).toBeNull();
    });

    it('honours a custom separator ReactNode', () => {
      const { container } = render(
        <Breadcrumb
          trail={trail}
          onNavigate={() => undefined}
          separator={<span data-cir-part="breadcrumb-separator">/</span>}
        />,
      );
      const seps = container.querySelectorAll('[data-cir-part="breadcrumb-separator"]');
      // crown + 3 trail segments = 4 items, 3 separators
      expect(seps.length).toBe(3);
      expect(seps[0]?.textContent).toBe('/');
    });

    it('trail wins over items when both are supplied', () => {
      render(
        <Breadcrumb items={[{ label: 'IGNORED' }]} trail={trail} onNavigate={() => undefined} />,
      );
      expect(screen.queryByText('IGNORED')).toBeNull();
      expect(screen.getByText('Refund')).not.toBeNull();
    });
  });
});
