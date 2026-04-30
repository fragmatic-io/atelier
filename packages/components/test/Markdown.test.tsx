// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown, MarkdownBinding } from '../src/components/Markdown.js';

describe('Markdown', () => {
  it('renders bold text', () => {
    const { container } = render(<Markdown content="**hello**" />);
    expect(container.querySelector('strong')?.textContent).toBe('hello');
  });
  it('renders external links with target=_blank', () => {
    render(<Markdown content="[ext](https://example.com)" />);
    const a = screen.getByRole('link', { name: 'ext' });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('relative links do not get target=_blank', () => {
    render(<Markdown content="[rel](/path)" />);
    const a = screen.getByRole('link', { name: 'rel' });
    expect(a.getAttribute('target')).toBeNull();
  });
  it('binding id matches', () => {
    expect(MarkdownBinding.id).toBe('Markdown');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<Markdown content="hi" />);
    expect(
      container.querySelector('[data-cir-component="Markdown"]')?.getAttribute('data-variant'),
    ).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(<Markdown content="x" variant={v} />);
      expect(
        container.querySelector('[data-cir-component="Markdown"]')?.getAttribute('data-variant'),
      ).toBe(v);
      unmount();
    }
  });
  it('applies the elevated variant class', () => {
    const { container } = render(<Markdown content="x" variant="elevated" />);
    const root = container.querySelector('[data-cir-component="Markdown"]') as HTMLElement;
    expect(root.className).toContain('shadow-md');
  });
});
