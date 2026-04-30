// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Calendar, CalendarBinding } from '../src/components/Calendar.js';

describe('Calendar', () => {
  it('renders a grid with weekday headers', () => {
    render(<Calendar month="2026-04" ariaLabel="Pick a date" />);
    expect(screen.getByRole('grid', { name: 'Pick a date' })).toBeTruthy();
    expect(document.querySelectorAll('[data-cir-part="calendar-weekday"]').length).toBe(7);
  });

  it('renders 30 day cells for April 2026', () => {
    render(<Calendar month="2026-04" ariaLabel="x" />);
    expect(document.querySelectorAll('[data-cir-part="calendar-day"]').length).toBe(30);
  });

  it('renders 28 cells for February 2026', () => {
    render(<Calendar month="2026-02" ariaLabel="x" />);
    expect(document.querySelectorAll('[data-cir-part="calendar-day"]').length).toBe(28);
  });

  it('renders 29 cells for February 2024 (leap)', () => {
    render(<Calendar month="2024-02" ariaLabel="x" />);
    expect(document.querySelectorAll('[data-cir-part="calendar-day"]').length).toBe(29);
  });

  it('clicking a day emits onChange with ISO', () => {
    const onChange = vi.fn();
    render(<Calendar month="2026-04" onChange={onChange} ariaLabel="x" />);
    fireEvent.click(document.querySelector('[data-date="2026-04-15"]')!);
    expect(onChange).toHaveBeenCalledWith('2026-04-15');
  });

  it('marks the selected value with aria-selected', () => {
    render(<Calendar month="2026-04" value="2026-04-10" ariaLabel="x" />);
    const selected = document.querySelector('[aria-selected="true"]');
    expect(selected?.getAttribute('data-cir-part')).toBe('calendar-day');
  });

  it('Next button advances the month', () => {
    const onMonthChange = vi.fn();
    render(<Calendar month="2026-04" onMonthChange={onMonthChange} ariaLabel="x" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenCalledWith('2026-05');
  });

  it('Prev button rolls the month back', () => {
    const onMonthChange = vi.fn();
    render(<Calendar month="2026-01" onMonthChange={onMonthChange} ariaLabel="x" />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onMonthChange).toHaveBeenCalledWith('2025-12');
  });

  it('applies highlight tone via data-tone', () => {
    render(
      <Calendar
        month="2026-04"
        ariaLabel="x"
        highlights={[{ date: '2026-04-05', tone: 'accent' }]}
      />,
    );
    const cell = document.querySelector('[data-date="2026-04-05"]')!.parentElement!;
    expect(cell.getAttribute('data-tone')).toBe('accent');
  });

  it('falls back to the value month when month is omitted', () => {
    const { container } = render(<Calendar value="2026-07-04" ariaLabel="x" />);
    expect(
      container.querySelector('[data-cir-component="Calendar"]')?.getAttribute('data-month'),
    ).toBe('2026-07');
  });

  it('binding id matches', () => {
    expect(CalendarBinding.id).toBe('Calendar');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<Calendar month="2026-04" ariaLabel="x" />);
    const root = container.querySelector('[data-cir-component="Calendar"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=embedded class', () => {
    const { container } = render(<Calendar month="2026-04" ariaLabel="x" variant="embedded" />);
    const root = container.querySelector('[data-cir-component="Calendar"]');
    expect(root?.className).toContain('bg-transparent');
  });
  it('reflects variant=minimal class', () => {
    const { container } = render(<Calendar month="2026-04" ariaLabel="x" variant="minimal" />);
    const root = container.querySelector('[data-cir-component="Calendar"]');
    expect(root?.className).toContain('border-b');
  });
});
