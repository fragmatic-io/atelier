// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Image, ImageBinding, imageTextRender } from '../src/components/Image.js';

describe('Image', () => {
  it('binding id matches', () => {
    expect(ImageBinding.id).toBe('Image');
  });

  it('renders a figure with a lazy <img>', () => {
    const { container } = render(<Image src="/a.jpg" alt="Alpha" />);
    const fig = container.querySelector('[data-cir-component="Image"]');
    expect(fig).not.toBeNull();
    const img = fig?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/a.jpg');
    expect(img?.getAttribute('alt')).toBe('Alpha');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('renders a caption when provided', () => {
    const { container } = render(<Image src="/a.jpg" alt="A" caption="A nice photo" />);
    expect(container.querySelector('figcaption')?.textContent).toBe('A nice photo');
  });

  it('omits the caption when not provided', () => {
    const { container } = render(<Image src="/a.jpg" alt="A" />);
    expect(container.querySelector('figcaption')).toBeNull();
  });

  it('non-lightbox image is not interactive (no role / tabIndex)', () => {
    const { container } = render(<Image src="/a.jpg" alt="A" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('role')).toBeNull();
    expect(img?.hasAttribute('tabindex')).toBe(false);
    expect(
      container.querySelector('[data-cir-component="Image"]')?.getAttribute('data-cir-lightbox'),
    ).toBe('false');
  });

  it('lightbox=true makes the image interactive (role + tabIndex + aria-haspopup)', () => {
    const { container } = render(<Image src="/a.jpg" alt="A" lightbox />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('role')).toBe('button');
    expect(img?.getAttribute('tabindex')).toBe('0');
    expect(img?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(
      container.querySelector('[data-cir-component="Image"]')?.getAttribute('data-cir-lightbox'),
    ).toBe('true');
  });

  it('clicking a lightbox image opens a single-item Lightbox', () => {
    const { container } = render(<Image src="/a.jpg" alt="Alpha" lightbox />);
    expect(document.querySelector('[data-cir-component="Lightbox"]')).toBeNull();
    fireEvent.click(container.querySelector('img')!);
    const lb = document.querySelector('[data-cir-component="Lightbox"]');
    expect(lb).not.toBeNull();
    const lbImg = document.querySelector('[data-cir-part="lightbox-image"]');
    expect(lbImg?.getAttribute('src')).toBe('/a.jpg');
    expect(lbImg?.getAttribute('alt')).toBe('Alpha');
    // Single item — index reads 1 of 1, no thumbnails strip.
    expect(document.querySelector('[data-cir-part="lightbox-index"]')?.textContent).toBe('1 of 1');
    expect(document.querySelector('[data-cir-part="lightbox-thumbnails"]')).toBeNull();
  });

  it('Enter / Space on a lightbox image opens the lightbox', () => {
    const { container } = render(<Image src="/a.jpg" alt="A" lightbox />);
    fireEvent.keyDown(container.querySelector('img')!, { key: 'Enter' });
    expect(document.querySelector('[data-cir-component="Lightbox"]')).not.toBeNull();
  });

  it('clicking a non-lightbox image does NOT open a lightbox', () => {
    const { container } = render(<Image src="/a.jpg" alt="A" />);
    fireEvent.click(container.querySelector('img')!);
    expect(document.querySelector('[data-cir-component="Lightbox"]')).toBeNull();
  });

  it('passes width / height into the Lightbox item', () => {
    const { container } = render(
      <Image src="/a.jpg" alt="A" caption="cap" width={400} height={300} lightbox />,
    );
    fireEvent.click(container.querySelector('img')!);
    const lbImg = document.querySelector('[data-cir-part="lightbox-image"]');
    expect(lbImg?.getAttribute('width')).toBe('400');
    expect(lbImg?.getAttribute('height')).toBe('300');
    expect(document.querySelector('[data-cir-part="lightbox-caption"]')?.textContent).toBe('cap');
  });

  it('text renderer prefers alt then caption then src', () => {
    expect(imageTextRender({ src: '/a.jpg', alt: 'A photo' })).toBe('[Image: A photo]');
    expect(imageTextRender({ src: '/a.jpg', caption: 'A caption' })).toBe('[Image: A caption]');
    expect(imageTextRender({ src: '/a.jpg' })).toBe('[Image: /a.jpg]');
  });

  it('binding declares manifestContract with `lightbox` allowed', () => {
    expect(ImageBinding.manifestContract).toBeDefined();
    expect(ImageBinding.manifestContract?.allowed_props['lightbox']).toBe('boolean');
    expect(ImageBinding.manifestContract?.allowed_props['src']).toBe('string');
  });
});
