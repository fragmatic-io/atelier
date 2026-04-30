// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Stepper, StepperBinding } from '../src/components/Stepper.js';

const STEPS = [
  { id: 'a', title: 'A', status: 'done' as const },
  { id: 'b', title: 'B', status: 'active' as const },
  { id: 'c', title: 'C', status: 'pending' as const },
  { id: 'd', title: 'D', status: 'error' as const },
];

describe('Stepper', () => {
  it('renders an <ol> with one <li> per step', () => {
    const { container } = render(<Stepper steps={STEPS} />);
    expect(container.querySelector('ol')).toBeTruthy();
    expect(container.querySelectorAll('li').length).toBe(4);
  });

  it('marks data-state per step status', () => {
    const { container } = render(<Stepper steps={STEPS} />);
    const items = container.querySelectorAll('li');
    expect(items[0]?.getAttribute('data-state')).toBe('done');
    expect(items[1]?.getAttribute('data-state')).toBe('active');
    expect(items[2]?.getAttribute('data-state')).toBe('pending');
    expect(items[3]?.getAttribute('data-state')).toBe('error');
  });

  it('the active step has aria-current=step', () => {
    const { container } = render(<Stepper steps={STEPS} />);
    const active = container.querySelector('li[data-state="active"]')!;
    expect(active.getAttribute('aria-current')).toBe('step');
  });

  it('default orientation is horizontal', () => {
    const { container } = render(<Stepper steps={STEPS} />);
    const ol = container.querySelector('ol')!;
    expect(ol.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('vertical orientation flips data attr and flex-direction', () => {
    const { container } = render(<Stepper steps={STEPS} orientation="vertical" />);
    const ol = container.querySelector('ol')!;
    expect(ol.getAttribute('data-orientation')).toBe('vertical');
    expect(ol.style.flexDirection).toBe('column');
  });

  it('exposes the aria-label on the list', () => {
    const { container } = render(<Stepper steps={STEPS} aria-label="Onboarding progress" />);
    expect(container.querySelector('ol')?.getAttribute('aria-label')).toBe('Onboarding progress');
  });

  it('binding id matches', () => {
    expect(StepperBinding.id).toBe('Stepper');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('default variant mirrors orientation horizontal', () => {
    const { container } = render(<Stepper steps={STEPS} />);
    const ol = container.querySelector('ol');
    expect(ol?.getAttribute('data-variant')).toBe('horizontal');
  });
  it('default variant mirrors orientation=vertical', () => {
    const { container } = render(<Stepper steps={STEPS} orientation="vertical" />);
    const ol = container.querySelector('ol');
    expect(ol?.getAttribute('data-variant')).toBe('vertical');
    expect(ol?.className).toContain('flex-col');
  });
  it('explicit variant=numbered overrides orientation', () => {
    const { container } = render(<Stepper steps={STEPS} variant="numbered" />);
    const ol = container.querySelector('ol');
    expect(ol?.getAttribute('data-variant')).toBe('numbered');
  });
});
