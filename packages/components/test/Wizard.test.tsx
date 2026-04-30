// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Wizard, WizardBinding } from '../src/components/Wizard.js';

const STEPS = [
  { id: 's1', title: 'Account', content: <div>step-1</div> },
  { id: 's2', title: 'Profile', content: <div>step-2</div> },
  { id: 's3', title: 'Review', content: <div>step-3</div> },
];

describe('Wizard', () => {
  it('renders one entry per step in the stepper', () => {
    render(<Wizard steps={STEPS} currentId="s1" onStepChange={() => undefined} />);
    const list = document.querySelector('[data-cir-part="wizard-steps"]')!;
    expect(list.querySelectorAll('[data-cir-part="wizard-step"]').length).toBe(3);
  });

  it('marks states (done/active/pending) based on currentId', () => {
    render(<Wizard steps={STEPS} currentId="s2" onStepChange={() => undefined} />);
    const items = document.querySelectorAll('[data-cir-part="wizard-step"]');
    expect(items[0]?.getAttribute('data-state')).toBe('done');
    expect(items[1]?.getAttribute('data-state')).toBe('active');
    expect(items[2]?.getAttribute('data-state')).toBe('pending');
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
  });

  it('renders the active step content', () => {
    render(<Wizard steps={STEPS} currentId="s2" onStepChange={() => undefined} />);
    expect(screen.getByText('step-2')).toBeTruthy();
  });

  it('Previous is disabled on the first step', () => {
    render(<Wizard steps={STEPS} currentId="s1" onStepChange={() => undefined} />);
    const prev = screen.getByRole<HTMLButtonElement>('button', { name: 'Previous' });
    expect(prev.disabled).toBe(true);
  });

  it('Next on a non-last step calls onStepChange with the next id', () => {
    const onStepChange = vi.fn();
    render(<Wizard steps={STEPS} currentId="s1" onStepChange={onStepChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onStepChange).toHaveBeenCalledWith('s2');
  });

  it('Previous goes back one', () => {
    const onStepChange = vi.fn();
    render(<Wizard steps={STEPS} currentId="s2" onStepChange={onStepChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onStepChange).toHaveBeenCalledWith('s1');
  });

  it('shows Finish on the last step and fires onComplete', () => {
    const onComplete = vi.fn();
    const onStepChange = vi.fn();
    render(
      <Wizard steps={STEPS} currentId="s3" onStepChange={onStepChange} onComplete={onComplete} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('falls back to step 0 when currentId is unknown', () => {
    render(<Wizard steps={STEPS} currentId="bogus" onStepChange={() => undefined} />);
    expect(screen.getByText('step-1')).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(WizardBinding.id).toBe('Wizard');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(
      <Wizard steps={STEPS} currentId="s1" onStepChange={() => undefined} />,
    );
    const root = container.querySelector('[data-cir-component="Wizard"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=sidebar layout class', () => {
    const { container } = render(
      <Wizard steps={STEPS} currentId="s1" onStepChange={() => undefined} variant="sidebar" />,
    );
    const root = container.querySelector('[data-cir-component="Wizard"]');
    expect(root?.getAttribute('data-variant')).toBe('sidebar');
    expect(root?.className).toContain('grid');
  });
  it('reflects variant=inline layout class', () => {
    const { container } = render(
      <Wizard steps={STEPS} currentId="s1" onStepChange={() => undefined} variant="inline" />,
    );
    const root = container.querySelector('[data-cir-component="Wizard"]');
    expect(root?.className).toContain('gap-2');
  });
});
