// @vitest-environment happy-dom
import './setup.js';
import { createRef, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimeInput, TimeInputBinding } from '../src/components/TimeInput.js';

describe('TimeInput', () => {
  it('renders a labelled <input type="time">', () => {
    render(<TimeInput label="Reminder" defaultValue="" />);
    const input = screen.getByLabelText<HTMLInputElement>('Reminder');
    expect(input.type).toBe('time');
  });

  it('renders helperText and error', () => {
    render(<TimeInput label="Reminder" helperText="24h" error="too late" />);
    expect(screen.getByText('24h')).toBeTruthy();
    expect(screen.getByText('too late')).toBeTruthy();
    const input = screen.getByLabelText<HTMLInputElement>('Reminder');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('controlled value round-trips', () => {
    function Harness(): ReactNode {
      const [v, setV] = useState('09:00');
      return (
        <TimeInput
          label="Reminder"
          value={v}
          onChange={(e) => {
            setV(e.currentTarget.value);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>('Reminder');
    expect(input.value).toBe('09:00');
    fireEvent.change(input, { target: { value: '14:30' } });
    expect(input.value).toBe('14:30');
  });

  it('forwards ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<TimeInput label="Reminder" ref={ref} defaultValue="" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('binding id matches', () => {
    expect(TimeInputBinding.id).toBe('TimeInput');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<TimeInput label="Time" />);
    const root = container.querySelector('[data-cir-component="TimeInput"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=embedded class', () => {
    const { container } = render(<TimeInput label="Time" variant="embedded" />);
    const root = container.querySelector('[data-cir-component="TimeInput"]');
    expect(root?.getAttribute('data-variant')).toBe('embedded');
    expect(root?.className).toContain('bg-transparent');
  });
  it('reflects variant=minimal class', () => {
    const { container } = render(<TimeInput label="Time" variant="minimal" />);
    const root = container.querySelector('[data-cir-component="TimeInput"]');
    expect(root?.className).toContain('border-b');
  });
});
