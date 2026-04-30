// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Progress, ProgressBinding } from '../src/components/Progress.js';

describe('Progress', () => {
  it('renders an indeterminate progress when value is undefined', () => {
    const { container } = render(<Progress />);
    const root = container.querySelector('[data-cir-component="Progress"]');
    expect(root?.getAttribute('data-mode')).toBe('indeterminate');
    const bar = container.querySelector('progress');
    expect(bar?.hasAttribute('value')).toBe(false);
  });
  it('renders a value-mode progress when value is provided', () => {
    const { container } = render(<Progress value={42} />);
    const root = container.querySelector('[data-cir-component="Progress"]');
    expect(root?.getAttribute('data-mode')).toBe('value');
    const bar = container.querySelector('progress');
    expect(bar?.getAttribute('value')).toBe('42');
    expect(bar?.getAttribute('max')).toBe('100');
  });
  it('renders the label when provided', () => {
    const { container } = render(<Progress label="Downloading" />);
    expect(container.querySelector('[data-cir-part="progress-label"]')?.textContent).toBe(
      'Downloading',
    );
  });
  it('binding id matches', () => {
    expect(ProgressBinding.id).toBe('Progress');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<Progress />);
    expect(
      container.querySelector('[data-cir-component="Progress"]')?.getAttribute('data-variant'),
    ).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(<Progress variant={v} />);
      expect(
        container.querySelector('[data-cir-component="Progress"]')?.getAttribute('data-variant'),
      ).toBe(v);
      unmount();
    }
  });
  it('applies the elevated variant class', () => {
    const { container } = render(<Progress variant="elevated" />);
    const root = container.querySelector('[data-cir-component="Progress"]') as HTMLElement;
    expect(root.className).toContain('shadow-md');
  });
});
