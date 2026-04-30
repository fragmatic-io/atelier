// @vitest-environment happy-dom
import './setup.js';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('renders the actions slot', () => {
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
});
