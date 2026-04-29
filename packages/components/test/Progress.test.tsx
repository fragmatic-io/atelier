// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Progress, ProgressBinding } from '../src/components/Progress.js';

describe('Progress', () => {
  it('renders a <progress> element', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('progress')).toBeTruthy();
  });

  it('determinate mode sets value/max attrs', () => {
    const { container } = render(<Progress value={75} />);
    const p = container.querySelector('progress')!;
    expect(p.getAttribute('value')).toBe('75');
    expect(p.getAttribute('max')).toBe('100');
  });

  it('indeterminate mode (no value) omits value/max', () => {
    const { container } = render(<Progress />);
    const p = container.querySelector('progress')!;
    expect(p.hasAttribute('value')).toBe(false);
  });

  it('exposes data-mode attr', () => {
    const { container, rerender } = render(<Progress value={1} />);
    expect(
      container.querySelector('[data-cir-component="Progress"]')?.getAttribute('data-mode'),
    ).toBe('value');
    rerender(<Progress />);
    expect(
      container.querySelector('[data-cir-component="Progress"]')?.getAttribute('data-mode'),
    ).toBe('indeterminate');
  });

  it('renders label and links it to the progress element', () => {
    const { container } = render(<Progress value={20} label="Uploading" />);
    const labelEl = container.querySelector('[data-cir-part="progress-label"]')!;
    const p = container.querySelector('progress')!;
    expect(labelEl.textContent).toBe('Uploading');
    expect(p.getAttribute('aria-labelledby')).toBe(labelEl.getAttribute('id'));
  });

  it('hides label visually when srOnlyLabel is true', () => {
    const { container } = render(<Progress value={20} label="Uploading" srOnlyLabel />);
    const labelEl = container.querySelector('[data-cir-part="progress-label"]') as HTMLElement;
    expect(labelEl.style.position).toBe('absolute');
    expect(labelEl.style.width).toBe('1px');
  });

  it('binding id matches', () => {
    expect(ProgressBinding.id).toBe('Progress');
  });
});
