// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  DropZone,
  DropZoneBinding,
  DROPZONE_DEFAULT_CAPABILITY,
  DROPZONE_DEFAULT_OVERLAY_LABEL,
  dropZoneTextRender,
  validateDroppedFiles,
  type DropZoneDispatcher,
  type DropZoneRejection,
} from '../src/components/DropZone.js';

type OnDropFn = (accepted: File[], rejected: DropZoneRejection[]) => void;

/**
 * Fire a drag-family event with an attached `dataTransfer.files`.
 *
 * happy-dom's synthetic `DragEvent` constructor does not honour a
 * `dataTransfer` field on the init dict, so we go through
 * `@testing-library/react`'s `fireEvent.<type>(el, { dataTransfer })`
 * which mirrors React-DOM's prop name and lets us pass an arbitrary
 * `{ files }` bag — same pattern the BlockEditor drag tests use.
 */
function fireDragEvent(
  el: Element | Document,
  type: 'dragEnter' | 'dragOver' | 'dragLeave' | 'drop',
  files: File[] = [],
): void {
  const dataTransfer = { files };
  // testing-library exposes the camelCase form (`dragEnter`, `dragOver`,
  // `dragLeave`, `drop`); the wrappers map to the lowercase DOM event
  // type for the actual dispatched event.
  fireEvent[type](el, { dataTransfer });
}

describe('DropZone', () => {
  it('renders children + no overlay at rest', () => {
    const { container, queryByText } = render(
      <DropZone>
        <p>contents</p>
      </DropZone>,
    );
    expect(queryByText('contents')).toBeTruthy();
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeNull();
    const root = container.querySelector('[data-cir-component="DropZone"]');
    expect(root?.getAttribute('data-cir-dragging')).toBeNull();
  });

  it('shows overlay on dragenter and hides on dragleave', () => {
    const { container, queryByText } = render(
      <DropZone>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    expect(root).toBeTruthy();
    fireDragEvent(root!, 'dragEnter');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeTruthy();
    expect(root!.getAttribute('data-cir-dragging')).toBe('true');
    fireDragEvent(root!, 'dragLeave');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeNull();
    expect(root!.getAttribute('data-cir-dragging')).toBeNull();
  });

  it('drag counter handles nested enter/leave without flickering the overlay', () => {
    const { container, queryByText } = render(
      <DropZone>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    // Outer enter — overlay shown.
    fireDragEvent(root!, 'dragEnter');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeTruthy();
    // Nested child enter — counter goes to 2; overlay stays.
    fireDragEvent(root!, 'dragEnter');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeTruthy();
    // First child leave — counter goes back to 1; overlay still on.
    fireDragEvent(root!, 'dragLeave');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeTruthy();
    // Final outer leave — counter hits 0; overlay hidden.
    fireDragEvent(root!, 'dragLeave');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeNull();
  });

  it('drop hides the overlay and fires onDrop with all files when no accept set', () => {
    const onDrop = vi.fn<OnDropFn>();
    const { container, queryByText } = render(
      <DropZone onDrop={onDrop}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    fireDragEvent(root!, 'dragEnter');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeTruthy();
    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.txt', { type: 'text/plain' });
    fireDragEvent(root!, 'drop', [a, b]);
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeNull();
    expect(onDrop).toHaveBeenCalledTimes(1);
    const [accepted, rejected] = onDrop.mock.calls[0]!;
    expect(accepted.map((f) => f.name)).toEqual(['a.png', 'b.txt']);
    expect(rejected).toEqual([]);
  });

  it('validates files by MIME (image/*) and rejects non-matching', () => {
    const onDrop = vi.fn<OnDropFn>();
    const { container } = render(
      <DropZone accept={['image/*']} onDrop={onDrop}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    const png = new File(['a'], 'a.png', { type: 'image/png' });
    const txt = new File(['b'], 'b.txt', { type: 'text/plain' });
    fireDragEvent(root!, 'drop', [png, txt]);
    const [accepted, rejected] = onDrop.mock.calls[0]!;
    expect(accepted.map((f) => f.name)).toEqual(['a.png']);
    const rej = rejected as Array<{ file: File; reason: string }>;
    expect(rej.length).toBe(1);
    expect(rej[0]?.file.name).toBe('b.txt');
    expect(rej[0]?.reason).toBe('mime');
  });

  it('validates files by extension (.png) — case-insensitive', () => {
    const onDrop = vi.fn<OnDropFn>();
    const { container } = render(
      <DropZone accept={['.png']} onDrop={onDrop}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    // Empty MIME on `image.PNG` — extension match must still hit.
    const upper = new File(['a'], 'image.PNG', { type: '' });
    const txt = new File(['b'], 'b.txt', { type: 'text/plain' });
    fireDragEvent(root!, 'drop', [upper, txt]);
    const [accepted, rejected] = onDrop.mock.calls[0]!;
    expect(accepted.map((f) => f.name)).toEqual(['image.PNG']);
    expect((rejected as Array<{ reason: string }>)[0]?.reason).toBe('mime');
  });

  it('rejects files larger than maxSize', () => {
    const onDrop = vi.fn<OnDropFn>();
    const { container } = render(
      <DropZone maxSize={5} onDrop={onDrop}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    const small = new File(['abc'], 'small.txt', { type: 'text/plain' });
    const big = new File(['abcdefghij'], 'big.txt', { type: 'text/plain' });
    fireDragEvent(root!, 'drop', [small, big]);
    const [accepted, rejected] = onDrop.mock.calls[0]!;
    expect(accepted.map((f) => f.name)).toEqual(['small.txt']);
    const rej = rejected as Array<{ file: File; reason: string }>;
    expect(rej[0]?.file.name).toBe('big.txt');
    expect(rej[0]?.reason).toBe('size');
  });

  it('drop dispatches { capability, params: { files } } via dispatcher', () => {
    const dispatcher = vi.fn<DropZoneDispatcher>().mockResolvedValue(undefined);
    const { container } = render(
      <DropZone dispatcher={dispatcher}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    const f = new File(['a'], 'a.png', { type: 'image/png' });
    fireDragEvent(root!, 'drop', [f]);
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(dispatcher.mock.calls[0]![0]).toBe(DROPZONE_DEFAULT_CAPABILITY);
    const params = dispatcher.mock.calls[0]![1] as { files: File[] };
    expect(params.files.length).toBe(1);
    expect(params.files[0]?.name).toBe('a.png');
  });

  it('honours a custom capability id', () => {
    const dispatcher = vi.fn<DropZoneDispatcher>().mockResolvedValue(undefined);
    const { container } = render(
      <DropZone capability="thread.attach" dispatcher={dispatcher}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    const f = new File(['a'], 'a.png', { type: 'image/png' });
    fireDragEvent(root!, 'drop', [f]);
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(dispatcher.mock.calls[0]![0]).toBe('thread.attach');
  });

  it('does NOT dispatch when accepted is empty', () => {
    const dispatcher = vi.fn<DropZoneDispatcher>().mockResolvedValue(undefined);
    const onDrop = vi.fn<OnDropFn>();
    const { container } = render(
      <DropZone accept={['image/*']} dispatcher={dispatcher} onDrop={onDrop}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    const txt = new File(['b'], 'b.txt', { type: 'text/plain' });
    fireDragEvent(root!, 'drop', [txt]);
    expect(dispatcher).not.toHaveBeenCalled();
    // onDrop still fires (with the rejection so the host can surface it).
    expect(onDrop).toHaveBeenCalledTimes(1);
    const [accepted, rejected] = onDrop.mock.calls[0]!;
    expect(accepted.length).toBe(0);
    expect((rejected as unknown[]).length).toBe(1);
  });

  it('does NOT dispatch when a drop carries zero files (e.g. text-only drag)', () => {
    const dispatcher = vi.fn<DropZoneDispatcher>().mockResolvedValue(undefined);
    const onDrop = vi.fn<OnDropFn>();
    const { container } = render(
      <DropZone dispatcher={dispatcher} onDrop={onDrop}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    fireDragEvent(root!, 'drop', []);
    expect(dispatcher).not.toHaveBeenCalled();
    // Bail-out path: with zero incoming files, onDrop is also skipped —
    // there's nothing for a host to surface.
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('multiple=false truncates accepted to a single file', () => {
    const onDrop = vi.fn<OnDropFn>();
    const dispatcher = vi.fn<DropZoneDispatcher>().mockResolvedValue(undefined);
    const { container } = render(
      <DropZone multiple={false} onDrop={onDrop} dispatcher={dispatcher}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.png', { type: 'image/png' });
    fireDragEvent(root!, 'drop', [a, b]);
    const [accepted] = onDrop.mock.calls[0]!;
    expect(accepted.map((f) => f.name)).toEqual(['a.png']);
    const params = dispatcher.mock.calls[0]![1] as { files: File[] };
    expect(params.files.map((f) => f.name)).toEqual(['a.png']);
  });

  it('disabled=true ignores all drag events', () => {
    const onDrop = vi.fn<OnDropFn>();
    const dispatcher = vi.fn<DropZoneDispatcher>().mockResolvedValue(undefined);
    const { container, queryByText } = render(
      <DropZone disabled onDrop={onDrop} dispatcher={dispatcher}>
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    fireDragEvent(root!, 'dragEnter');
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeNull();
    expect(root!.getAttribute('data-cir-dragging')).toBeNull();
    expect(root!.getAttribute('data-disabled')).toBe('true');
    const f = new File(['a'], 'a.png', { type: 'image/png' });
    fireDragEvent(root!, 'drop', [f]);
    expect(onDrop).not.toHaveBeenCalled();
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('host=true attaches listeners to document.body', () => {
    const addSpy = vi.spyOn(document.body, 'addEventListener');
    const removeSpy = vi.spyOn(document.body, 'removeEventListener');
    const { unmount } = render(
      <DropZone host>
        <p>contents</p>
      </DropZone>,
    );
    const types = addSpy.mock.calls.map((c) => c[0]);
    expect(types).toEqual(expect.arrayContaining(['dragenter', 'dragover', 'dragleave', 'drop']));
    unmount();
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(expect.arrayContaining(['dragenter', 'dragover', 'dragleave', 'drop']));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('host=true: drop on document.body triggers dispatcher + onDrop', () => {
    const dispatcher = vi.fn<DropZoneDispatcher>().mockResolvedValue(undefined);
    const onDrop = vi.fn<OnDropFn>();
    render(
      <DropZone host dispatcher={dispatcher} onDrop={onDrop}>
        <p>contents</p>
      </DropZone>,
    );
    const f = new File(['a'], 'a.png', { type: 'image/png' });
    fireDragEvent(document.body, 'drop', [f]);
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it('host=true: does NOT attach when disabled', () => {
    const addSpy = vi.spyOn(document.body, 'addEventListener');
    render(
      <DropZone host disabled>
        <p>contents</p>
      </DropZone>,
    );
    const types = addSpy.mock.calls.map((c) => c[0]);
    expect(types).not.toContain('dragEnter');
    expect(types).not.toContain('drop');
    addSpy.mockRestore();
  });

  it('uses a custom overlay label when supplied', () => {
    const { container, queryByText } = render(
      <DropZone overlayLabel="Drop to attach">
        <p>contents</p>
      </DropZone>,
    );
    const root = container.querySelector('[data-cir-component="DropZone"]');
    fireDragEvent(root!, 'dragEnter');
    expect(queryByText('Drop to attach')).toBeTruthy();
    expect(queryByText(DROPZONE_DEFAULT_OVERLAY_LABEL)).toBeNull();
  });

  it('binding id matches', () => {
    expect(DropZoneBinding.id).toBe('DropZone');
  });

  it('text-render returns a single-line summary', () => {
    expect(dropZoneTextRender({})).toBe('[DropZone]');
    expect(dropZoneTextRender({ host: true })).toBe('[DropZone host]');
  });

  // -- validateDroppedFiles unit tests ---------------------------------------
  describe('validateDroppedFiles', () => {
    it('accepts everything when accept is empty / absent', () => {
      const a = new File(['a'], 'a.png', { type: 'image/png' });
      const b = new File(['b'], 'b.txt', { type: 'text/plain' });
      const r = validateDroppedFiles([a, b]);
      expect(r.accepted.length).toBe(2);
      expect(r.rejected.length).toBe(0);
    });

    it('matches a wildcard MIME prefix', () => {
      const a = new File(['a'], 'a.png', { type: 'image/png' });
      const b = new File(['b'], 'b.svg', { type: 'image/svg+xml' });
      const c = new File(['c'], 'c.txt', { type: 'text/plain' });
      const r = validateDroppedFiles([a, b, c], { accept: ['image/*'] });
      expect(r.accepted.map((f) => f.name)).toEqual(['a.png', 'b.svg']);
      expect(r.rejected.map((x) => x.file.name)).toEqual(['c.txt']);
    });

    it('matches an exact MIME', () => {
      const a = new File(['a'], 'a.png', { type: 'image/png' });
      const b = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
      const r = validateDroppedFiles([a, b], { accept: ['image/png'] });
      expect(r.accepted.map((f) => f.name)).toEqual(['a.png']);
      expect(r.rejected.map((x) => x.file.name)).toEqual(['b.jpg']);
    });

    it('matches an extension with leading dot AND without', () => {
      const a = new File(['a'], 'a.PNG', { type: '' });
      const b = new File(['b'], 'b.jpg', { type: '' });
      const r1 = validateDroppedFiles([a, b], { accept: ['.png'] });
      expect(r1.accepted.map((f) => f.name)).toEqual(['a.PNG']);
      const r2 = validateDroppedFiles([a, b], { accept: ['png'] });
      expect(r2.accepted.map((f) => f.name)).toEqual(['a.PNG']);
    });

    it('combines maxSize with accept (mime first)', () => {
      // Reject reason for a too-big file with an OK MIME should be `'size'`.
      const big = new File(['x'.repeat(20)], 'big.png', { type: 'image/png' });
      const r = validateDroppedFiles([big], { accept: ['image/*'], maxSize: 5 });
      expect(r.accepted.length).toBe(0);
      expect(r.rejected[0]?.reason).toBe('size');
    });
  });
});
