// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Tree — recursive, expandable node tree using native `<details>` /
 * `<summary>`. The platform element gives us keyboard activation (Enter /
 * Space) and visual disclosure for free.
 *
 * A node with `children` renders as a `<details>` whose `<summary>` carries
 * the label; a leaf renders as a `<button>` so it remains keyboard-focusable
 * and clicks naturally bubble to `onSelect`. The currently-selected node
 * carries `aria-selected="true"` (and `data-selected`).
 *
 * We intentionally lift only "selected id" into state — expansion is
 * controlled by the platform `<details>` element itself, seeded by
 * `defaultExpandedIds`. That keeps the component cheap and avoids the
 * controlled/uncontrolled mismatch that bites larger tree libraries.
 */
import { useState, type MouseEvent, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface TreeNode {
  id: string;
  label: ReactNode;
  children?: readonly TreeNode[];
  icon?: ReactNode;
}

export interface TreeProps {
  nodes: readonly TreeNode[];
  defaultExpandedIds?: readonly string[];
  onSelect?: (id: string) => void;
  className?: string;
}

interface NodeViewProps {
  node: TreeNode;
  expandedSet: ReadonlySet<string>;
  selectedId: string | null;
  onPick: (id: string) => void;
}

function NodeView({ node, expandedSet, selectedId, onPick }: NodeViewProps): ReactNode {
  const hasChildren = node.children !== undefined && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    onPick(node.id);
  };
  if (hasChildren) {
    return (
      <li
        role="treeitem"
        aria-selected={isSelected}
        data-cir-part="tree-node"
        data-selected={isSelected ? 'true' : 'false'}
      >
        <details open={expandedSet.has(node.id)}>
          <summary data-cir-part="tree-summary" onClick={handleClick}>
            {node.icon !== undefined ? (
              <span data-cir-part="tree-icon" aria-hidden="true">
                {node.icon}
              </span>
            ) : null}
            <span data-cir-part="tree-label">{node.label}</span>
          </summary>
          <ul role="group" data-cir-part="tree-children">
            {(node.children ?? []).map((child) => (
              <NodeView
                key={child.id}
                node={child}
                expandedSet={expandedSet}
                selectedId={selectedId}
                onPick={onPick}
              />
            ))}
          </ul>
        </details>
      </li>
    );
  }
  return (
    <li
      role="treeitem"
      aria-selected={isSelected}
      data-cir-part="tree-node"
      data-leaf="true"
      data-selected={isSelected ? 'true' : 'false'}
    >
      <button type="button" data-cir-part="tree-leaf" onClick={handleClick}>
        {node.icon !== undefined ? (
          <span data-cir-part="tree-icon" aria-hidden="true">
            {node.icon}
          </span>
        ) : null}
        <span data-cir-part="tree-label">{node.label}</span>
      </button>
    </li>
  );
}

export function Tree({ nodes, defaultExpandedIds, onSelect, className }: TreeProps): ReactNode {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const expandedSet: ReadonlySet<string> = new Set(defaultExpandedIds ?? []);

  const onPick = (id: string): void => {
    setSelectedId(id);
    onSelect?.(id);
  };

  return (
    <ul role="tree" data-cir-component="Tree" className={className}>
      {nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          expandedSet={expandedSet}
          selectedId={selectedId}
          onPick={onPick}
        />
      ))}
    </ul>
  );
}

Tree.displayName = 'Tree';

function countNodes(nodes: readonly TreeNode[]): number {
  let total = 0;
  for (const n of nodes) {
    total += 1;
    if (n.children !== undefined) total += countNodes(n.children);
  }
  return total;
}

export function treeTextRender(props: TreeProps): string {
  return `[Tree: ${String(countNodes(props.nodes))} nodes]`;
}

export const TreeBinding: ComponentBinding = {
  id: 'Tree',
  factory: Tree,
};
