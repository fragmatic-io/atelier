// @vitest-environment happy-dom
import './setup.js';
import { createRef, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextInput, TextInputBinding } from '../src/components/TextInput.js';

describe('TextInput', () => {
  it('binds the label to the input via for/id', () => {
    render(<TextInput label="Name" defaultValue="" />);
    const input = screen.getByLabelText<HTMLInputElement>('Name');
    expect(input.id).toBeTruthy();
    expect(input.tagName).toBe('INPUT');
  });

  it('respects an explicit id', () => {
    render(<TextInput label="Name" id="my-input" defaultValue="" />);
    const input = screen.getByLabelText<HTMLInputElement>('Name');
    expect(input.id).toBe('my-input');
  });

  it('renders helperText', () => {
    render(<TextInput label="Email" helperText="we never share" />);
    expect(screen.getByText('we never share')).toBeTruthy();
  });

  it('sets aria-invalid and renders the error when error prop is set', () => {
    render(<TextInput label="Email" error="required" />);
    const input = screen.getByLabelText<HTMLInputElement>('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('required')).toBeTruthy();
  });

  it('works uncontrolled with defaultValue', () => {
    render(<TextInput label="Email" defaultValue="hi@example.com" />);
    const input = screen.getByLabelText<HTMLInputElement>('Email');
    expect(input.value).toBe('hi@example.com');
  });

  it('works controlled — value + onChange round-trips', () => {
    function Harness(): ReactNode {
      const [v, setV] = useState('a');
      return (
        <TextInput
          label="Email"
          value={v}
          onChange={(e) => {
            setV(e.currentTarget.value);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>('Email');
    expect(input.value).toBe('a');
    fireEvent.change(input, { target: { value: 'b' } });
    expect(input.value).toBe('b');
  });

  it('forwards ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextInput label="Name" ref={ref} defaultValue="" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes the type prop through', () => {
    render(<TextInput label="Email" type="email" defaultValue="" />);
    expect(screen.getByLabelText<HTMLInputElement>('Email').type).toBe('email');
  });

  it('binding id matches', () => {
    expect(TextInputBinding.id).toBe('TextInput');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<TextInput label="x" defaultValue="" />);
    const root = container.querySelector('[data-cir-component="TextInput"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=embedded and variant=minimal on data-variant', () => {
    for (const variant of ['embedded', 'minimal'] as const) {
      const { container, unmount } = render(
        <TextInput label="x" variant={variant} defaultValue="" />,
      );
      const root = container.querySelector('[data-cir-component="TextInput"]');
      expect(root?.getAttribute('data-variant')).toBe(variant);
      unmount();
    }
  });
  it('applies the variant utility class for variant=minimal', () => {
    const { container } = render(<TextInput label="x" variant="minimal" defaultValue="" />);
    const root = container.querySelector('[data-cir-component="TextInput"]');
    expect(root?.className).toContain('border-b');
    expect(root?.className).toContain('rounded-none');
  });
});
