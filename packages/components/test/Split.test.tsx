// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Split, SplitBinding, splitTextRender } from '../src/components/Split.js';

describe('Split', () => {
  it('renders two panes and a separator', () => {
    const { container } = render(
      <Split>{[<div key="a">left</div>, <div key="b">right</div>]}</Split>,
    );
    expect(container.querySelectorAll('[data-cir-part="split-pane"]').length).toBe(2);
    expect(screen.getByRole('separator')).toBeTruthy();
  });

  it('defaults to horizontal orientation with vertical separator', () => {
    render(<Split>{[<div key="a">L</div>, <div key="b">R</div>]}</Split>);
    const sep = screen.getByRole('separator');
    expect(sep.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('uses defaultSize as initial aria-valuenow', () => {
    render(<Split defaultSize={70}>{[<div key="a">L</div>, <div key="b">R</div>]}</Split>);
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('70');
  });

  it('vertical orientation flips separator orientation', () => {
    render(<Split orientation="vertical">{[<div key="a">T</div>, <div key="b">B</div>]}</Split>);
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('respects minSize for valuemin / valuemax', () => {
    render(<Split minSize={20}>{[<div key="a">L</div>, <div key="b">R</div>]}</Split>);
    const sep = screen.getByRole('separator');
    expect(sep.getAttribute('aria-valuemin')).toBe('20');
    expect(sep.getAttribute('aria-valuemax')).toBe('80');
  });

  it('updates valuenow and fires onResize on pointer drag', () => {
    const onResize = vi.fn();
    const { container } = render(
      <Split defaultSize={50} onResize={onResize}>
        {[<div key="a">L</div>, <div key="b">R</div>]}
      </Split>,
    );
    const root = container.querySelector('[data-cir-component="Split"]') as HTMLDivElement;
    // Stub the bounding box so the component can compute a percentage.
    root.getBoundingClientRect = (): DOMRect => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 200,
      width: 1000,
      height: 200,
      toJSON: () => ({}),
    });
    const sep = screen.getByRole('separator');
    // happy-dom may not implement setPointerCapture; stub it.
    (sep as HTMLElement & { setPointerCapture?: (id: number) => void }).setPointerCapture =
      (): void => undefined;
    (sep as HTMLElement & { releasePointerCapture?: (id: number) => void }).releasePointerCapture =
      (): void => undefined;
    (sep as HTMLElement & { hasPointerCapture?: (id: number) => boolean }).hasPointerCapture =
      (): boolean => false;
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 500, clientY: 100 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 750, clientY: 100 });
    expect(onResize).toHaveBeenCalled();
    expect(sep.getAttribute('aria-valuenow')).toBe('75');
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 750, clientY: 100 });
  });

  it('clamps to minSize when dragged past the edge', () => {
    const onResize = vi.fn();
    const { container } = render(
      <Split minSize={15} onResize={onResize}>
        {[<div key="a">L</div>, <div key="b">R</div>]}
      </Split>,
    );
    const root = container.querySelector('[data-cir-component="Split"]') as HTMLDivElement;
    root.getBoundingClientRect = (): DOMRect => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 200,
      width: 1000,
      height: 200,
      toJSON: () => ({}),
    });
    const sep = screen.getByRole('separator');
    (sep as HTMLElement & { setPointerCapture?: (id: number) => void }).setPointerCapture =
      (): void => undefined;
    (sep as HTMLElement & { hasPointerCapture?: (id: number) => boolean }).hasPointerCapture =
      (): boolean => false;
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 500, clientY: 100 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 0, clientY: 100 });
    expect(sep.getAttribute('aria-valuenow')).toBe('15');
  });

  it('ignores pointer move when not dragging', () => {
    const onResize = vi.fn();
    render(<Split onResize={onResize}>{[<div key="a">L</div>, <div key="b">R</div>]}</Split>);
    const sep = screen.getByRole('separator');
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 700 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('text-render mentions orientation', () => {
    expect(splitTextRender({ orientation: 'vertical', children: [null, null] })).toBe(
      '[Split vertical]',
    );
    expect(splitTextRender({ children: [null, null] })).toBe('[Split horizontal]');
  });

  it('binding id matches', () => {
    expect(SplitBinding.id).toBe('Split');
  });
});
