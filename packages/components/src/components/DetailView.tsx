// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * DetailView — semantic key-value list rendered as `<dl>` with `<dt>` /
 * `<dd>` pairs. The description-list element is the correct semantic
 * container for "label/value" data and is exposed as such to assistive
 * tech.
 *
 * `dense` is a presentational hint surfaced as `data-density` so the CSS
 * layer can tighten spacing. The component itself ships no styling.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface DetailField {
  label: string;
  value: ReactNode;
}

export interface DetailViewProps {
  fields: readonly DetailField[];
  dense?: boolean;
  className?: string;
}

export function DetailView({ fields, dense, className }: DetailViewProps): ReactNode {
  return (
    <dl
      data-cir-component="DetailView"
      data-density={dense ? 'dense' : 'normal'}
      className={className}
    >
      {fields.map((f, i) => (
        <div key={`${String(i)}:${f.label}`} data-cir-part="detail-pair">
          <dt data-cir-part="detail-label">{f.label}</dt>
          <dd data-cir-part="detail-value">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

DetailView.displayName = 'DetailView';

export function detailViewTextRender(props: DetailViewProps): string {
  return `[Detail: ${String(props.fields.length)} fields]`;
}

export const DetailViewBinding: ComponentBinding = {
  id: 'DetailView',
  factory: DetailView,
};
