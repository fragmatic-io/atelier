// @vitest-environment happy-dom
import './setup.js';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ButtonGroup, ButtonGroupBinding } from '../src/components/ButtonGroup.js';

describe('ButtonGroup', () => {
  it('renders children inside a role=group element', () => {
    render(
      <ButtonGroup aria-label="actions">
        <button type="button">a</button>
        <button type="button">b</button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group', { name: 'actions' });
    expect(group).toBeTruthy();
  });
  it('forwards ref to the underlying div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ButtonGroup ref={ref} aria-label="x">
        <span>c</span>
      </ButtonGroup>,
    );
    expect(ref.current?.tagName).toBe('DIV');
  });
  it('binding id matches', () => {
    expect(ButtonGroupBinding.id).toBe('ButtonGroup');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=secondary and size=md', () => {
    render(
      <ButtonGroup aria-label="x">
        <span>c</span>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group');
    expect(group.getAttribute('data-variant')).toBe('secondary');
    expect(group.getAttribute('data-size')).toBe('md');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'outline', 'destructive'] as const) {
      const { unmount } = render(
        <ButtonGroup aria-label="x" variant={v}>
          <span>c</span>
        </ButtonGroup>,
      );
      expect(screen.getByRole('group').getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the destructive variant class', () => {
    render(
      <ButtonGroup aria-label="x" variant="destructive">
        <span>c</span>
      </ButtonGroup>,
    );
    expect(screen.getByRole('group').className).toContain('bg-red-600');
  });
});
