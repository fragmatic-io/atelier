// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tree, TreeBinding, treeTextRender } from '../src/components/Tree.js';

const NODES = [
  {
    id: 'root',
    label: 'Root',
    children: [
      { id: 'a', label: 'Alpha' },
      {
        id: 'b',
        label: 'Beta',
        children: [{ id: 'b1', label: 'Beta-1' }],
      },
    ],
  },
];

describe('Tree', () => {
  it('renders a role="tree" container', () => {
    render(<Tree nodes={NODES} />);
    expect(screen.getByRole('tree')).toBeTruthy();
  });

  it('renders treeitem elements for every node', () => {
    render(<Tree nodes={NODES} />);
    expect(screen.getAllByRole('treeitem').length).toBe(4);
  });

  it('renders <details> for branches and <button> for leaves', () => {
    const { container } = render(<Tree nodes={NODES} />);
    expect(container.querySelectorAll('details').length).toBe(2);
    expect(container.querySelectorAll('[data-cir-part="tree-leaf"]').length).toBe(2);
  });

  it('honours defaultExpandedIds', () => {
    const { container } = render(<Tree nodes={NODES} defaultExpandedIds={['root']} />);
    const all = container.querySelectorAll('details');
    expect(all[0]?.open).toBe(true);
  });

  it('emits onSelect when a leaf is clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Tree nodes={NODES} defaultExpandedIds={['root']} onSelect={onSelect} />,
    );
    const leaves = container.querySelectorAll('[data-cir-part="tree-leaf"]');
    fireEvent.click(leaves[0]!);
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('marks selected node with aria-selected="true"', () => {
    const { container } = render(<Tree nodes={NODES} defaultExpandedIds={['root']} />);
    const leaves = container.querySelectorAll('[data-cir-part="tree-leaf"]');
    fireEvent.click(leaves[0]!);
    const items = container.querySelectorAll('[role="treeitem"]');
    const aSelected = Array.from(items).find((n) => n.getAttribute('aria-selected') === 'true');
    expect(aSelected).toBeTruthy();
  });

  it('renders icons when provided', () => {
    const { container } = render(
      <Tree
        nodes={[
          {
            id: 'r',
            label: 'R',
            icon: <span>ICN</span>,
            children: [{ id: 'k', label: 'Leaf', icon: <span>L-ICN</span> }],
          },
        ]}
        defaultExpandedIds={['r']}
      />,
    );
    expect(container.querySelectorAll('[data-cir-part="tree-icon"]').length).toBe(2);
  });

  it('text-render counts all nodes recursively', () => {
    expect(treeTextRender({ nodes: NODES })).toBe('[Tree: 4 nodes]');
  });

  it('binding id matches', () => {
    expect(TreeBinding.id).toBe('Tree');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default', () => {
    const { container } = render(<Tree nodes={NODES} />);
    const root = container.querySelector('[data-cir-component="Tree"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
    expect(root?.className).toContain('text-sm');
  });
  it('reflects variant=condensed class', () => {
    const { container } = render(<Tree nodes={NODES} variant="condensed" />);
    const root = container.querySelector('[data-cir-component="Tree"]');
    expect(root?.getAttribute('data-variant')).toBe('condensed');
    expect(root?.className).toContain('text-xs');
  });
});
