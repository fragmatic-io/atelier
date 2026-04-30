// @vitest-environment happy-dom
import './setup.js';
import { createRef, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateInput, DateInputBinding } from '../src/components/DateInput.js';

describe('DateInput', () => {
  it('renders a labelled <input type="date">', () => {
    render(<DateInput label="Birthday" defaultValue="" />);
    const input = screen.getByLabelText<HTMLInputElement>('Birthday');
    expect(input.type).toBe('date');
    expect(input.id).toBeTruthy();
  });

  it('respects an explicit id', () => {
    render(<DateInput label="Birthday" id="bday" defaultValue="" />);
    expect(screen.getByLabelText<HTMLInputElement>('Birthday').id).toBe('bday');
  });

  it('renders helperText', () => {
    render(<DateInput label="Birthday" helperText="ISO format" />);
    expect(screen.getByText('ISO format')).toBeTruthy();
  });

  it('flips aria-invalid and surfaces error message', () => {
    render(<DateInput label="Birthday" error="required" />);
    const input = screen.getByLabelText<HTMLInputElement>('Birthday');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('required')).toBeTruthy();
  });

  it('controlled value round-trips via onChange', () => {
    function Harness(): ReactNode {
      const [v, setV] = useState('2025-01-01');
      return (
        <DateInput
          label="Birthday"
          value={v}
          onChange={(e) => {
            setV(e.currentTarget.value);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>('Birthday');
    expect(input.value).toBe('2025-01-01');
    fireEvent.change(input, { target: { value: '2026-04-29' } });
    expect(input.value).toBe('2026-04-29');
  });

  it('forwards ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<DateInput label="Birthday" ref={ref} defaultValue="" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('binding id matches', () => {
    expect(DateInputBinding.id).toBe('DateInput');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<DateInput label="Date" />);
    const root = container.querySelector('[data-cir-component="DateInput"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=embedded on data-variant', () => {
    const { container } = render(<DateInput label="Date" variant="embedded" />);
    const root = container.querySelector('[data-cir-component="DateInput"]');
    expect(root?.getAttribute('data-variant')).toBe('embedded');
    expect(root?.className).toContain('bg-transparent');
  });
  it('reflects variant=minimal class', () => {
    const { container } = render(<DateInput label="Date" variant="minimal" />);
    const root = container.querySelector('[data-cir-component="DateInput"]');
    expect(root?.className).toContain('border-b');
  });
});
