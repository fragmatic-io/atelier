// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
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
import type { ComponentBinding } from '@cir/runtime';

export interface CodeViewProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeView({
  code,
  language,
  showLineNumbers = false,
  className,
}: CodeViewProps): ReactNode {
  const lines = code.split('\n');
  return (
    <div
      data-cir-component="CodeView"
      data-language={language ?? 'plain'}
      className={className}
      style={{ display: 'flex', alignItems: 'stretch' }}
    >
      {showLineNumbers ? (
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
