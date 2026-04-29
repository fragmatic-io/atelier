// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stack, StackBinding, STACK_GAP_PX } from '../src/components/Stack.js';

describe('Stack', () => {
  it('renders children inside a role=group container', () => {
    render(
      <Stack>
        <span>one</span>
        <span>two</span>
      </Stack>,
    );
    const group = screen.getByRole('group');
    expect(group).toBeTruthy();
    expect(group.textContent).toBe('onetwo');
  });

  it('defaults to vertical direction and md gap', () => {
    render(<Stack>x</Stack>);
    const group = screen.getByRole('group');
    expect(group.getAttribute('data-direction')).toBe('vertical');
    expect(group.getAttribute('data-gap')).toBe('md');
    expect(group.style.flexDirection).toBe('column');
    expect(group.style.gap).toBe(`${String(STACK_GAP_PX.md)}px`);
  });

  it('applies horizontal direction', () => {
    render(<Stack direction="horizontal">x</Stack>);
    const group = screen.getByRole('group');
    expect(group.getAttribute('data-direction')).toBe('horizontal');
    expect(group.style.flexDirection).toBe('row');
  });

  it('applies large gap token', () => {
    render(<Stack gap="lg">x</Stack>);
    const group = screen.getByRole('group');
    expect(group.getAttribute('data-gap')).toBe('lg');
    expect(group.style.gap).toBe(`${String(STACK_GAP_PX.lg)}px`);
  });

  it('applies small gap token', () => {
    render(<Stack gap="sm">x</Stack>);
    expect(screen.getByRole('group').style.gap).toBe(`${String(STACK_GAP_PX.sm)}px`);
  });

  it('applies align prop', () => {
    render(<Stack align="center">x</Stack>);
    expect(screen.getByRole('group').style.alignItems).toBe('center');
  });

  it('passes className through', () => {
    render(<Stack className="my-stack">x</Stack>);
    expect(screen.getByRole('group').className).toBe('my-stack');
  });

  it('exposes a binding with the right id and the component as factory', () => {
    expect(StackBinding.id).toBe('Stack');
    expect(StackBinding.factory).toBe(Stack);
  });
});
