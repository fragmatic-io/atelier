// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  MultiPane,
  MultiPaneBinding,
  multiPaneTextRender,
  type PaneSpec,
} from '../src/components/MultiPane.js';

function makePanes(): PaneSpec[] {
  return [
    {
      id: 'sidebar',
      label: 'Sidebar',
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
      pane: <div>sidebar</div>,
    },
    {
      id: 'main',
      label: 'Main',
      defaultSize: 600,
      minSize: 200,
      pane: <div>main</div>,
    },
    {
      id: 'thread',
      label: 'Thread',
      defaultSize: 300,
      minSize: 200,
      collapsible: true,
      pane: <div>thread</div>,
    },
  ];
}

function stubPointerCapture(el: HTMLElement): void {
  (el as HTMLElement & { setPointerCapture?: (id: number) => void }).setPointerCapture =
    (): void => undefined;
  (el as HTMLElement & { releasePointerCapture?: (id: number) => void }).releasePointerCapture =
    (): void => undefined;
  (el as HTMLElement & { hasPointerCapture?: (id: number) => boolean }).hasPointerCapture =
    (): boolean => false;
}

describe('MultiPane', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('renders all N panes', () => {
    const { container } = render(<MultiPane panes={makePanes()} />);
    const panes = container.querySelectorAll('[data-cir-part="multipane-pane"]');
    expect(panes.length).toBe(3);
    expect(screen.getByText('sidebar')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('thread')).toBeTruthy();
  });

  it('renders drag handles between every pair of panes (N-1 handles)', () => {
    const { container } = render(<MultiPane panes={makePanes()} />);
    const handles = container.querySelectorAll('[data-cir-part="multipane-handle"]');
    expect(handles.length).toBe(2);
  });

  it('handles carry the left/right pane ids for clamp resolution', () => {
    const { container } = render(<MultiPane panes={makePanes()} />);
    const handles = container.querySelectorAll('[data-cir-part="multipane-handle"]');
    expect(handles[0]?.getAttribute('data-left')).toBe('sidebar');
    expect(handles[0]?.getAttribute('data-right')).toBe('main');
    expect(handles[1]?.getAttribute('data-left')).toBe('main');
    expect(handles[1]?.getAttribute('data-right')).toBe('thread');
  });

  it('defaults direction to horizontal with vertical separators', () => {
    const { container } = render(<MultiPane panes={makePanes()} />);
    expect(container.querySelector('[data-cir-component="MultiPane"]')?.getAttribute('data-direction')).toBe(
      'horizontal',
    );
    const handle = container.querySelector('[data-cir-part="multipane-handle"]');
    expect(handle?.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('vertical direction flips separator orientation', () => {
    const { container } = render(<MultiPane panes={makePanes()} direction="vertical" />);
    const handle = container.querySelector('[data-cir-part="multipane-handle"]');
    expect(handle?.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('drag updates pane sizes (left grows, right shrinks)', () => {
    const onResize = vi.fn();
    const { container } = render(<MultiPane panes={makePanes()} onResize={onResize} />);
    const handle = container.querySelectorAll('[data-cir-part="multipane-handle"]')[0] as HTMLDivElement;
    stubPointerCapture(handle);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 250, clientY: 50 });
    expect(onResize).toHaveBeenCalled();
    const last = onResize.mock.calls[onResize.mock.calls.length - 1]?.[0] as Record<string, number>;
    expect(last['sidebar']).toBe(250);
    expect(last['main']).toBe(550);
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 250, clientY: 50 });
  });

  it('clamps drag to the left pane minSize', () => {
    const onResize = vi.fn();
    const { container } = render(<MultiPane panes={makePanes()} onResize={onResize} />);
    const handle = container.querySelectorAll('[data-cir-part="multipane-handle"]')[0] as HTMLDivElement;
    stubPointerCapture(handle);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 50 });
    // Drag 1000 px to the left — sidebar should clamp at minSize=100.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -800, clientY: 50 });
    const last = onResize.mock.calls[onResize.mock.calls.length - 1]?.[0] as Record<string, number>;
    expect(last['sidebar']).toBe(100);
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: -800, clientY: 50 });
  });

  it('clamps drag to the left pane maxSize', () => {
    const onResize = vi.fn();
    const { container } = render(<MultiPane panes={makePanes()} onResize={onResize} />);
    const handle = container.querySelectorAll('[data-cir-part="multipane-handle"]')[0] as HTMLDivElement;
    stubPointerCapture(handle);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 50 });
    // Drag 1000 px to the right — sidebar should clamp at maxSize=400.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1200, clientY: 50 });
    const last = onResize.mock.calls[onResize.mock.calls.length - 1]?.[0] as Record<string, number>;
    expect(last['sidebar']).toBe(400);
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 1200, clientY: 50 });
  });

  it('clamps drag to the right pane minSize (cannot shrink past it)', () => {
    const onResize = vi.fn();
    // Specifically scope this test to the right-pane-min clamp by
    // removing the sidebar's max ceiling (otherwise the sidebar's maxSize
    // would dominate a large rightward drag).
    const panes: PaneSpec[] = [
      { id: 'sidebar', label: 'Sidebar', defaultSize: 200, minSize: 100, pane: <div>s</div> },
      { id: 'main', label: 'Main', defaultSize: 600, minSize: 200, pane: <div>m</div> },
      { id: 'thread', label: 'Thread', defaultSize: 300, minSize: 200, pane: <div>t</div> },
    ];
    const { container } = render(<MultiPane panes={panes} onResize={onResize} />);
    const handle = container.querySelectorAll('[data-cir-part="multipane-handle"]')[0] as HTMLDivElement;
    stubPointerCapture(handle);
    // sidebar=200, main=600. main.minSize=200. Dragging the handle right by
    // 500px would shrink main to 100 — should clamp so main stays at 200.
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700, clientY: 50 });
    const last = onResize.mock.calls[onResize.mock.calls.length - 1]?.[0] as Record<string, number>;
    expect(last['main']).toBe(200);
    expect(last['sidebar']).toBe(600);
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 700, clientY: 50 });
  });

  it('collapse toggle hides the pane and shows a rail', () => {
    const onCollapseChange = vi.fn();
    const { container } = render(
      <MultiPane panes={makePanes()} onCollapseChange={onCollapseChange} />,
    );
    const collapseBtn = container.querySelector(
      '[data-cir-part="multipane-collapse"][data-pane="thread"]',
    ) as HTMLButtonElement;
    expect(collapseBtn).toBeTruthy();
    fireEvent.click(collapseBtn);
    expect(onCollapseChange).toHaveBeenCalledWith(
      expect.objectContaining({ thread: true }),
    );
    expect(container.querySelector('[data-cir-part="multipane-rail"][data-pane="thread"]')).toBeTruthy();
    // The pane content node should no longer be in the tree (rail replaced it).
    expect(
      container.querySelector('[data-cir-part="multipane-pane"][data-pane="thread"]'),
    ).toBeNull();
  });

  it('rail click expands the pane back', () => {
    const { container } = render(<MultiPane panes={makePanes()} />);
    fireEvent.click(
      container.querySelector(
        '[data-cir-part="multipane-collapse"][data-pane="thread"]',
      ) as HTMLButtonElement,
    );
    const rail = container.querySelector(
      '[data-cir-part="multipane-rail"][data-pane="thread"]',
    ) as HTMLButtonElement;
    expect(rail).toBeTruthy();
    fireEvent.click(rail);
    expect(
      container.querySelector('[data-cir-part="multipane-pane"][data-pane="thread"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-cir-part="multipane-rail"][data-pane="thread"]'),
    ).toBeNull();
  });

  it('persists sizes to localStorage when storageKey is set', () => {
    const { container } = render(<MultiPane panes={makePanes()} storageKey="ws.layout" />);
    const handle = container.querySelectorAll('[data-cir-part="multipane-handle"]')[0] as HTMLDivElement;
    stubPointerCapture(handle);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 280, clientY: 50 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 280, clientY: 50 });
    const raw = window.localStorage.getItem('ws.layout.sizes');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, number>;
    expect(parsed['sidebar']).toBe(280);
    expect(parsed['main']).toBe(520);
  });

  it('reads persisted sizes on mount', () => {
    window.localStorage.setItem(
      'ws.layout.sizes',
      JSON.stringify({ sidebar: 333, main: 555, thread: 222 }),
    );
    const { container } = render(<MultiPane panes={makePanes()} storageKey="ws.layout" />);
    const sidebar = container.querySelector(
      '[data-cir-part="multipane-pane"][data-pane="sidebar"]',
    ) as HTMLDivElement;
    expect(sidebar).toBeTruthy();
    // Grid template should have 333px somewhere in it (sidebar was first).
    const root = container.querySelector('[data-cir-component="MultiPane"]') as HTMLDivElement;
    const tpl = root.style.gridTemplateColumns;
    expect(tpl.includes('333px')).toBe(true);
  });

  it('persists collapsed state to localStorage', () => {
    const { container } = render(<MultiPane panes={makePanes()} storageKey="ws.layout" />);
    fireEvent.click(
      container.querySelector(
        '[data-cir-part="multipane-collapse"][data-pane="thread"]',
      ) as HTMLButtonElement,
    );
    const raw = window.localStorage.getItem('ws.layout.collapsed');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, boolean>;
    expect(parsed['thread']).toBe(true);
  });

  it('reads persisted collapsed state on mount', () => {
    window.localStorage.setItem(
      'ws.layout.collapsed',
      JSON.stringify({ thread: true }),
    );
    const { container } = render(<MultiPane panes={makePanes()} storageKey="ws.layout" />);
    expect(
      container.querySelector('[data-cir-part="multipane-rail"][data-pane="thread"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-cir-part="multipane-pane"][data-pane="thread"]'),
    ).toBeNull();
  });

  it('does not persist when storageKey is undefined (in-memory only)', () => {
    const { container } = render(<MultiPane panes={makePanes()} />);
    fireEvent.click(
      container.querySelector(
        '[data-cir-part="multipane-collapse"][data-pane="thread"]',
      ) as HTMLButtonElement,
    );
    // Confirm no localStorage entries were written.
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      expect(k?.startsWith('ws.layout')).not.toBe(true);
    }
  });

  it('vertical direction lays out panes top-to-bottom', () => {
    const { container } = render(<MultiPane panes={makePanes()} direction="vertical" />);
    const root = container.querySelector('[data-cir-component="MultiPane"]') as HTMLDivElement;
    expect(root.style.gridTemplateRows).not.toBe('');
    expect(root.style.gridTemplateColumns).toBe('');
  });

  it('text-render lists pane labels and direction', () => {
    expect(multiPaneTextRender({ panes: makePanes() })).toBe(
      '[MultiPane horizontal: Sidebar / Main / Thread]',
    );
    expect(multiPaneTextRender({ panes: makePanes(), direction: 'vertical' })).toBe(
      '[MultiPane vertical: Sidebar / Main / Thread]',
    );
  });

  it('binding id matches', () => {
    expect(MultiPaneBinding.id).toBe('MultiPane');
  });

  it('non-collapsible panes do not render a collapse control', () => {
    const { container } = render(<MultiPane panes={makePanes()} />);
    expect(
      container.querySelector('[data-cir-part="multipane-collapse"][data-pane="sidebar"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-cir-part="multipane-collapse"][data-pane="main"]'),
    ).toBeNull();
  });

  it('pointer move without prior pointer down does nothing', () => {
    const onResize = vi.fn();
    const { container } = render(<MultiPane panes={makePanes()} onResize={onResize} />);
    const handle = container.querySelectorAll('[data-cir-part="multipane-handle"]')[0] as HTMLDivElement;
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700, clientY: 50 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
