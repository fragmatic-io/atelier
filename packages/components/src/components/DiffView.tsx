// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * DiffView — line-by-line text diff renderer.
 *
 * The component does NOT compute a diff; the caller supplies pre-computed
 * `hunks` (from a server-side diff or a precomputed manifest). Each hunk
 * carries a `kind` (`add` / `remove` / `context`) which we surface as
 * `data-kind` on a row so a Phase 4c CSS layer can paint backgrounds.
 *
 * Old / new line numbers (`oldNumber`, `newNumber`) are rendered as small
 * gutter columns so the visual format matches GitHub-style unified diff.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, diffViewVariantClass, type DiffViewVariant } from './_variants.js';

export type DiffKind = 'add' | 'remove' | 'context';

export interface DiffHunk {
  kind: DiffKind;
  line: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface DiffViewProps {
  hunks: readonly DiffHunk[];
  className?: string;
  variant?: DiffViewVariant;
}

const PREFIX: Readonly<Record<DiffKind, string>> = Object.freeze({
  add: '+',
  remove: '-',
  context: ' ',
});

export function DiffView({ hunks, className, variant = 'unified' }: DiffViewProps): ReactNode {
  return (
    <pre
      data-cir-component="DiffView"
      data-variant={variant}
      className={cn(diffViewVariantClass[variant], className)}
      style={{
        margin: 0,
        fontFamily: 'ui-monospace, monospace',
        overflow: 'auto',
      }}
    >
      {hunks.map((h, i) => (
        <div
          key={`hunk-${String(i)}`}
          data-cir-part="diff-row"
          data-kind={h.kind}
          style={{ display: 'flex', whiteSpace: 'pre' }}
        >
          <span
            data-cir-part="diff-old-num"
            aria-hidden="true"
            style={{ display: 'inline-block', width: '3ch', textAlign: 'right', opacity: 0.6 }}
          >
            {h.oldNumber !== undefined ? String(h.oldNumber) : ''}
          </span>
          <span
            data-cir-part="diff-new-num"
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '3ch',
              textAlign: 'right',
              padding: '0 6px',
              opacity: 0.6,
            }}
          >
            {h.newNumber !== undefined ? String(h.newNumber) : ''}
          </span>
          <span data-cir-part="diff-marker" aria-hidden="true">
            {PREFIX[h.kind]}
          </span>
          <span data-cir-part="diff-line">{h.line}</span>
        </div>
      ))}
    </pre>
  );
}

DiffView.displayName = 'DiffView';

export function diffViewTextRender(props: DiffViewProps): string {
  let adds = 0;
  let removes = 0;
  for (const h of props.hunks) {
    if (h.kind === 'add') adds += 1;
    else if (h.kind === 'remove') removes += 1;
  }
  return `[DiffView: +${String(adds)} -${String(removes)}]`;
}

export const DiffViewBinding: ComponentBinding = {
  id: 'DiffView',
  factory: DiffView,
};
