// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Form, FormBinding } from '../src/components/Form.js';

describe('Form', () => {
  it('renders children plus default Submit button', () => {
    render(
      <Form onSubmit={() => undefined}>
        <input name="email" defaultValue="x@example.com" />
      </Form>,
    );
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });

  it('does NOT render Cancel when onCancel is omitted', () => {
    render(
      <Form onSubmit={() => undefined}>
        <input name="x" />
      </Form>,
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('renders Cancel + custom labels when configured', () => {
    render(
      <Form
        onSubmit={() => undefined}
        onCancel={() => undefined}
        submitLabel="Save"
        cancelLabel="Discard"
      >
        <input name="x" />
      </Form>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
  });

  it('onSubmit receives a FormData with the input value', () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <input name="email" defaultValue="ada@example.com" />
      </Form>,
    );
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const fd = onSubmit.mock.calls[0]?.[0] as FormData;
    expect(fd.get('email')).toBe('ada@example.com');
  });

  it('Cancel button has type=button and fires onCancel', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit} onCancel={onCancel}>
        <input name="x" />
      </Form>,
    );
    const cancel = screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' });
    expect(cancel.type).toBe('button');
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables both buttons while an async submit is in flight', async () => {
    let resolve: (() => void) | null = null;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    const onSubmit = vi.fn(() => promise);
    render(
      <Form onSubmit={onSubmit} onCancel={() => undefined}>
        <input name="x" />
      </Form>,
    );
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Submit' });
    fireEvent.submit(submit.closest('form')!);
    expect(submit.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
    await act(async () => {
      resolve!();
      await promise;
    });
    expect(submit.disabled).toBe(false);
  });

  it('binding id matches', () => {
    expect(FormBinding.id).toBe('Form');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<Form onSubmit={() => undefined}>x</Form>);
    const form = container.querySelector('[data-cir-component="Form"]');
    expect(form?.getAttribute('data-variant')).toBe('default');
    expect(form?.className).toContain('gap-4');
  });
  it('reflects variant=compact', () => {
    const { container } = render(
      <Form onSubmit={() => undefined} variant="compact">
        x
      </Form>,
    );
    const form = container.querySelector('[data-cir-component="Form"]');
    expect(form?.className).toContain('gap-2');
  });
  it('reflects variant=spacious', () => {
    const { container } = render(
      <Form onSubmit={() => undefined} variant="spacious">
        x
      </Form>,
    );
    const form = container.querySelector('[data-cir-component="Form"]');
    expect(form?.getAttribute('data-variant')).toBe('spacious');
    expect(form?.className).toContain('gap-6');
  });
});
