// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * DetailView — semantic key-value list as <dl>. Variants (Wave 6 / P-10):
 * bordered, elevated, ghost (default), tinted.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';

export type DetailViewVariant = ContentVariant;

export interface DetailField {
  label: string;
  value: ReactNode;
}

export interface DetailViewProps {
  fields: readonly DetailField[];
  dense?: boolean;
  variant?: DetailViewVariant;
  className?: string;
}

export function DetailView({
  fields,
  dense,
  variant = 'ghost',
  className,
}: DetailViewProps): ReactNode {
  return (
    <dl
      data-cir-component="DetailView"
      data-density={dense ? 'dense' : 'normal'}
      data-variant={variant}
      className={cn(contentVariantClass[variant], className)}
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
export const DetailViewBinding: ComponentBinding = { id: 'DetailView', factory: DetailView };
