// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog, ConfirmDialogBinding } from '../src/components/ConfirmDialog.js';

describe('ConfirmDialog', () => {
  it('renders title and description', () => {
    render(
      <ConfirmDialog
        open
        title="Delete file?"
        description="This cannot be undone."
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByText('Delete file?')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
  });

  it('renders default button labels and a custom label', () => {
    const { rerender } = render(
      <ConfirmDialog open title="t" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    rerender(
      <ConfirmDialog
        open
        title="t"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No' })).toBeTruthy();
  });

  it('fires onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="t" onConfirm={onConfirm} onCancel={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="t" onConfirm={() => undefined} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses destructive variant on the confirm button when destructive=true', () => {
    render(
      <ConfirmDialog
        open
        destructive
        title="t"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    const root = document.querySelector('[data-cir-component="ConfirmDialog"]');
    expect(root?.getAttribute('data-destructive')).toBe('true');
  });

  it('focuses cancel when opened', () => {
    render(<ConfirmDialog open title="t" onConfirm={() => undefined} onCancel={() => undefined} />);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
  });

  it('emits onCancel when the dialog fires the native cancel event (Escape)', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="t" onConfirm={() => undefined} onCancel={onCancel} />);
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    const evt = new Event('cancel', { cancelable: true });
    dialog?.dispatchEvent(evt);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('opens and closes when open prop toggles', () => {
    const { rerender } = render(
      <ConfirmDialog
        open={false}
        title="t"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(false);
    rerender(
      <ConfirmDialog open title="t" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(dialog?.hasAttribute('open')).toBe(true);
    rerender(
      <ConfirmDialog
        open={false}
        title="t"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(dialog?.hasAttribute('open')).toBe(false);
  });

  it('disables both buttons while a Promise-returning onConfirm is pending', async () => {
    let resolveIt: (() => void) | undefined;
    const onConfirm = (): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveIt = resolve;
      });
    render(<ConfirmDialog open title="t" onConfirm={onConfirm} onCancel={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    // After click, busy=true should disable both buttons.
    await Promise.resolve();
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm' });
    const cancel = screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' });
    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    resolveIt?.();
  });

  it('binding id matches', () => {
    expect(ConfirmDialogBinding.id).toBe('ConfirmDialog');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(
      <ConfirmDialog open title="t" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    const dlg = container.querySelector('[data-cir-component="ConfirmDialog"]');
    expect(dlg?.getAttribute('data-variant')).toBe('default');
  });
  it('legacy destructive=true defaults variant to destructive', () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="t"
        destructive
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const dlg = container.querySelector('[data-cir-component="ConfirmDialog"]');
    expect(dlg?.getAttribute('data-variant')).toBe('destructive');
    expect(dlg?.className).toContain('ring-red-300');
  });
  it('explicit variant prop wins over destructive boolean', () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="t"
        destructive
        variant="default"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const dlg = container.querySelector('[data-cir-component="ConfirmDialog"]');
    expect(dlg?.getAttribute('data-variant')).toBe('default');
  });
});
