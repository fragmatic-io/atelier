// @vitest-environment happy-dom
import './setup.js';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Card, CardBinding } from '../src/components/Card.js';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>hello body</Card>);
    expect(screen.getByText('hello body')).toBeTruthy();
  });
  it('renders title heading when title is set', () => {
    render(<Card title="My card">body</Card>);
    expect(screen.getByRole('heading', { level: 3, name: 'My card' })).toBeTruthy();
  });
  it('renders the legacy ReactNode actions slot in the header', () => {
    render(
      <Card title="t" actions={<button type="button">act</button>}>
        body
      </Card>,
    );
    expect(screen.getByRole('button', { name: 'act' })).toBeTruthy();
  });
  it('omits the header entirely when no title and no actions', () => {
    const { container } = render(<Card>just body</Card>);
    expect(container.querySelector('header')).toBeNull();
  });
  it('forwards ref to the underlying section', () => {
    const ref = createRef<HTMLElement>();
    render(<Card ref={ref}>body</Card>);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('SECTION');
  });
  it('binding id matches', () => {
    expect(CardBinding.id).toBe('Card');
  });
  it('binding declares actionSlots: [onAction] for runtime dispatch', () => {
    expect(CardBinding.actionSlots).toEqual(['onAction']);
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=bordered', () => {
    const { container } = render(<Card>x</Card>);
    const section = container.querySelector('section');
    expect(section?.getAttribute('data-variant')).toBe('bordered');
    expect(section?.className).toContain('border');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(<Card variant={v}>x</Card>);
      expect(container.querySelector('section')?.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('elevated variant emits the shadow class', () => {
    const { container } = render(<Card variant="elevated">x</Card>);
    expect(container.querySelector('section')?.className).toContain('shadow-md');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and exposes data-density', () => {
    const { container } = render(<Card>x</Card>);
    expect(container.querySelector('section')?.getAttribute('data-density')).toBe('comfortable');
  });
  it('tightens body padding at compact density', () => {
    const { container, rerender } = render(<Card density="comfortable">x</Card>);
    const comfyBody = container.querySelector<HTMLElement>('[data-cir-part="card-body"]');
    const comfyPad = parseInt(comfyBody?.style.padding ?? '0', 10);
    rerender(<Card density="compact">x</Card>);
    const compactBody = container.querySelector<HTMLElement>('[data-cir-part="card-body"]');
    const compactPad = parseInt(compactBody?.style.padding ?? '0', 10);
    expect(compactPad).toBeLessThan(comfyPad);
  });

  // -- Marketplace pivot: tile-shaped Card --
  describe('tile mode', () => {
    it('renders an <img> when image is supplied', () => {
      const { container } = render(<Card image="https://example.com/x.jpg" title="X" />);
      const img = container.querySelector('img[data-cir-part="card-image"]');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('https://example.com/x.jpg');
    });
    it('renders subtitle and price when supplied', () => {
      render(<Card title="Phone" subtitle="Apple" price={999.99} />);
      expect(screen.getByText('Apple')).toBeTruthy();
      expect(screen.getByText('$999.99')).toBeTruthy();
    });
    it('passes a string price through verbatim', () => {
      render(<Card title="t" price="$1,234" />);
      expect(screen.getByText('$1,234')).toBeTruthy();
    });
    it('renders a MetaBadge when badge is supplied', () => {
      const { container } = render(<Card title="t" badge="Save 20%" />);
      const badge = container.querySelector('[data-cir-component="MetaBadge"]');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('Save 20%');
    });
    it('renders declarative CardAction[] buttons in the footer', () => {
      const onAction = vi.fn();
      render(
        <Card
          title="Phone"
          actions={[{ id: 'cart.add', label: 'Add', variant: 'primary' }]}
          onAction={onAction}
        />,
      );
      const btn = screen.getByRole('button', { name: 'Add' });
      fireEvent.click(btn);
      expect(onAction).toHaveBeenCalledWith('cart.add', undefined);
    });
    it('threads the row item to onAction when data is supplied', () => {
      const item = { id: 1, title: 'Phone' };
      const onAction = vi.fn();
      render(<Card data={item} actions={[{ id: 'cart.add', label: 'Add' }]} onAction={onAction} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(onAction).toHaveBeenCalledWith('cart.add', item);
    });
    it('disables footer buttons when no onAction is supplied', () => {
      render(<Card title="t" actions={[{ id: 'cart.add', label: 'Add' }]} />);
      const btn = screen.getByRole('button', { name: 'Add' });
      expect(btn.hasAttribute('disabled')).toBe(true);
    });
    it('defaults image/title/subtitle/price/badge from a product-shape data prop', () => {
      const item = {
        id: 1,
        title: 'Phone',
        brand: 'Apple',
        price: 999,
        thumbnail: 'https://example.com/p.jpg',
        discountPercentage: 20,
      };
      const { container } = render(<Card data={item} />);
      expect(screen.getByRole('heading', { name: 'Phone' })).toBeTruthy();
      expect(screen.getByText('Apple')).toBeTruthy();
      expect(screen.getByText('$999.00')).toBeTruthy();
      const img = container.querySelector('img[data-cir-part="card-image"]');
      expect(img?.getAttribute('src')).toBe('https://example.com/p.jpg');
      expect(container.querySelector('[data-cir-component="MetaBadge"]')?.textContent).toContain(
        'Save 20%',
      );
    });
    it('explicit props win over data-derived defaults', () => {
      const item = { title: 'Phone', brand: 'Apple', price: 999 };
      render(<Card data={item} title="Override" subtitle="Custom" />);
      expect(screen.getByRole('heading', { name: 'Override' })).toBeTruthy();
      expect(screen.getByText('Custom')).toBeTruthy();
      expect(screen.queryByText('Apple')).toBeNull();
    });
    it('falls back to images[0] when thumbnail is absent', () => {
      const item = { title: 'Phone', images: ['https://example.com/i0.jpg'] };
      const { container } = render(<Card data={item} />);
      const img = container.querySelector('img[data-cir-part="card-image"]');
      expect(img?.getAttribute('src')).toBe('https://example.com/i0.jpg');
    });
    it('keeps legacy header rendering when no tile fields are supplied', () => {
      const { container } = render(
        <Card title="legacy" actions={<button type="button">x</button>}>
          body
        </Card>,
      );
      // No tile attribute — the legacy section path was taken.
      expect(container.querySelector('section')?.getAttribute('data-cir-tile')).toBeNull();
      expect(container.querySelector('[data-cir-part="card-actions"]')).not.toBeNull();
    });
  });
});
