// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal, ModalBinding } from '../src/components/Modal.js';

describe('Modal', () => {
  it('renders title and body when open', () => {
    render(
      <Modal open title="Edit" onClose={() => undefined}>
        body content
      </Modal>,
    );
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('body content')).toBeTruthy();
  });
  it('toggles dialog open attribute when open prop flips', () => {
    const { rerender } = render(
      <Modal open={false} title="t" onClose={() => undefined}>
        x
      </Modal>,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(false);
    rerender(
      <Modal open title="t" onClose={() => undefined}>
        x
      </Modal>,
    );
    expect(dialog?.hasAttribute('open')).toBe(true);
    rerender(
      <Modal open={false} title="t" onClose={() => undefined}>
        x
      </Modal>,
    );
    expect(dialog?.hasAttribute('open')).toBe(false);
  });
  it('reflects size as data attr and width style', () => {
    render(
      <Modal open size="lg" title="t" onClose={() => undefined}>
        x
      </Modal>,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog?.getAttribute('data-size')).toBe('lg');
    expect((dialog as HTMLDialogElement).style.width).toBe('880px');
  });
  it('default size is md', () => {
    render(
      <Modal open title="t" onClose={() => undefined}>
        x
      </Modal>,
    );
    expect(document.querySelector('dialog')?.getAttribute('data-size')).toBe('md');
  });
  it('emits onClose when Escape (cancel) fires', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="t" onClose={onClose}>
        x
      </Modal>,
    );
    const dialog = document.querySelector('dialog')!;
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('emits onClose when the backdrop (dialog element itself) is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="t" onClose={onClose}>
        x
      </Modal>,
    );
    const dialog = document.querySelector('dialog')!;
    fireEvent.click(dialog, { target: dialog });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('does NOT emit onClose when an inner element is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="t" onClose={onClose}>
        <button type="button">inner</button>
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'inner' }));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('binding id matches', () => {
    expect(ModalBinding.id).toBe('Modal');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=elevated', () => {
    render(
      <Modal open title="t" onClose={() => undefined}>
        x
      </Modal>,
    );
    expect(document.querySelector('dialog')?.getAttribute('data-variant')).toBe('elevated');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { unmount } = render(
        <Modal open title="t" onClose={() => undefined} variant={v}>
          x
        </Modal>,
      );
      expect(document.querySelector('dialog')?.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('combines size + variant', () => {
    render(
      <Modal open title="t" onClose={() => undefined} size="lg" variant="bordered">
        x
      </Modal>,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog?.getAttribute('data-size')).toBe('lg');
    expect(dialog?.getAttribute('data-variant')).toBe('bordered');
    expect(dialog?.className).toContain('border');
  });
});
