// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Gallery, GalleryBinding } from '../src/components/Gallery.js';

const ITEMS = [
  { id: '1', src: '/a.jpg', alt: 'Alpha' },
  { id: '2', src: '/b.jpg', alt: 'Bravo', caption: 'Bravo cap' },
  { id: '3', src: '/c.jpg', alt: 'Charlie' },
];

describe('Gallery', () => {
  it('renders one figure per item', () => {
    const { container } = render(<Gallery items={ITEMS} />);
    expect(container.querySelectorAll('figure').length).toBe(3);
  });

  it('every image is lazy-loaded with the right alt', () => {
    const { container } = render(<Gallery items={ITEMS} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(3);
    imgs.forEach((img) => {
      expect(img.getAttribute('loading')).toBe('lazy');
    });
    expect(imgs[0]?.getAttribute('alt')).toBe('Alpha');
    expect(imgs[1]?.getAttribute('src')).toBe('/b.jpg');
  });

  it('renders captions only when provided', () => {
    const { container } = render(<Gallery items={ITEMS} />);
    const caps = container.querySelectorAll('figcaption');
    expect(caps.length).toBe(1);
    expect(caps[0]?.textContent).toBe('Bravo cap');
  });

  it('honours columns prop and floors at 1', () => {
    const { container, rerender } = render(<Gallery items={ITEMS} columns={4} />);
    let root = container.querySelector('[data-cir-component="Gallery"]')!;
    expect(root.getAttribute('data-columns')).toBe('4');
    rerender(<Gallery items={ITEMS} columns={0} />);
    root = container.querySelector('[data-cir-component="Gallery"]')!;
    expect(root.getAttribute('data-columns')).toBe('1');
  });

  it('default columns is 3', () => {
    const { container } = render(<Gallery items={ITEMS} />);
    expect(
      container.querySelector('[data-cir-component="Gallery"]')?.getAttribute('data-columns'),
    ).toBe('3');
  });

  it('binding id matches', () => {
    expect(GalleryBinding.id).toBe('Gallery');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=grid and emits data-variant', () => {
    const { container } = render(<Gallery items={ITEMS} />);
    const root = container.querySelector('[data-cir-component="Gallery"]');
    expect(root?.getAttribute('data-variant')).toBe('grid');
  });
  it('reflects variant=masonry layout class', () => {
    const { container } = render(<Gallery items={ITEMS} variant="masonry" />);
    const root = container.querySelector('[data-cir-component="Gallery"]');
    expect(root?.getAttribute('data-variant')).toBe('masonry');
    expect(root?.className).toContain('columns-3');
  });
  it('reflects variant=carousel layout class', () => {
    const { container } = render(<Gallery items={ITEMS} variant="carousel" />);
    const root = container.querySelector('[data-cir-component="Gallery"]');
    expect(root?.className).toContain('overflow-x-auto');
    expect(root?.className).toContain('snap-x');
  });
});
