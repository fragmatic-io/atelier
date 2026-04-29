// @vitest-environment happy-dom
import './setup.js';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ButtonGroup, ButtonGroupBinding } from '../src/components/ButtonGroup.js';
import { Button } from '../src/components/Button.js';

describe('ButtonGroup', () => {
  it('renders children inside a role=group with the provided aria-label', () => {
    render(
      <ButtonGroup aria-label="Toolbar">
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>,
    );
    const grp = screen.getByRole('group', { name: 'Toolbar' });
    expect(grp).toBeTruthy();
    expect(grp.getAttribute('data-cir-component')).toBe('ButtonGroup');
    expect(screen.getByRole('button', { name: 'One' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Two' })).toBeTruthy();
  });

  it('forwards a ref to the underlying div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ButtonGroup aria-label="x" ref={ref}>
        <Button>Go</Button>
      </ButtonGroup>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('merges caller className and inline style', () => {
    render(
      <ButtonGroup aria-label="x" className="custom" style={{ padding: 8 }}>
        <Button>x</Button>
      </ButtonGroup>,
    );
    const grp = screen.getByRole('group');
    expect(grp.className).toBe('custom');
    expect(grp.style.padding).toBe('8px');
    expect(grp.style.display).toBe('inline-flex');
  });

  it('binding id matches', () => {
    expect(ButtonGroupBinding.id).toBe('ButtonGroup');
  });
});
