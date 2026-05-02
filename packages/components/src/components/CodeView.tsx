// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * CodeView — read-only code display.
 *
 * Renders `<pre><code>` with the language hint surfaced as `data-language`
 * for downstream styling / tooling. Optionally prepends an `<ol>` of line
 * numbers as a flex sibling — a `<table>` would also work but pulls in
 * column-width layout machinery we don't need at this fidelity.
 *
 * No syntax highlighting in v1 (that would force a Prism / Shiki dep).
 * Phase 6 can layer highlighting behind a feature flag without changing
 * this component's API.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, codeViewVariantClass, type CodeViewVariant } from './_variants.js';

export interface CodeViewProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
  variant?: CodeViewVariant;
}

export function CodeView({
  code,
  language,
  showLineNumbers = false,
  className,
  variant = 'default',
}: CodeViewProps): ReactNode {
  const lines = code.split('\n');
  // The 'numbered' variant always shows line numbers regardless of the
  // explicit prop — that's the whole point of the variant.
  const effectiveLineNumbers = variant === 'numbered' ? true : showLineNumbers;
  return (
    <div
      data-cir-component="CodeView"
      data-language={language ?? 'plain'}
      data-variant={variant}
      className={cn(codeViewVariantClass[variant], className)}
      style={{ display: 'flex', alignItems: 'stretch' }}
    >
      {effectiveLineNumbers ? (
        <ol
          data-cir-part="codeview-line-numbers"
          aria-hidden="true"
          style={{
            margin: 0,
            padding: '0 8px',
            listStyle: 'none',
            textAlign: 'right',
            userSelect: 'none',
            opacity: 0.6,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {lines.map((_, i) => (
            <li key={`ln-${String(i)}`}>{i + 1}</li>
          ))}
        </ol>
      ) : null}
      <pre
        data-cir-part="codeview-pre"
        style={{
          margin: 0,
          padding: '0 8px',
          flex: 1,
          fontFamily: 'ui-monospace, monospace',
          overflow: 'auto',
        }}
      >
        <code data-cir-part="codeview-code">{code}</code>
      </pre>
    </div>
  );
}

CodeView.displayName = 'CodeView';

export function codeViewTextRender(props: CodeViewProps): string {
  const lines = props.code.split('\n').length;
  return `[CodeView: ${props.language ?? 'plain'} (${String(lines)} lines)]`;
}

export const CodeViewBinding: ComponentBinding = {
  id: 'CodeView',
  factory: CodeView,
};
