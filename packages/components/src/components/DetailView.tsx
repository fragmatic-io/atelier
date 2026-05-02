// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * DetailView — semantic key-value list as <dl>. Variants (Wave 6 / P-10):
 * bordered, elevated, ghost (default), tinted.
 *
 * Wave 11 / Vis-6 — opt-in to the personalisation density pipeline. The
 * existing `dense?: boolean` prop continues to work (back-compat with hosts
 * that toggle the boolean from a settings UI), but a `density?: Density`
 * prop now wins when supplied. The render walker fills `density` from
 * `resolveDensity(intent, route)` so manifests do not micro-author it
 * per-node; setting `dense: true` collapses to `density: 'compact'`.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';
import { DEFAULT_DENSITY, type Density } from './density.js';

export type DetailViewVariant = ContentVariant;

export interface DetailField {
  label: string;
  value: ReactNode;
}

export interface DetailViewProps {
  fields: readonly DetailField[];
  /** Legacy compact toggle — collapses to `density='compact'` when true. */
  dense?: boolean;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: DetailViewVariant;
  className?: string;
}

export function DetailView({
  fields,
  dense,
  density: densityProp,
  variant = 'ghost',
  className,
}: DetailViewProps): ReactNode {
  // Resolve the effective density: explicit `density` wins; legacy `dense`
  // (true → compact) is the back-compat path; otherwise the framework default.
  const density: Density =
    densityProp ?? (dense === true ? 'compact' : (DEFAULT_DENSITY satisfies Density));
  return (
    <dl
      data-cir-component="DetailView"
      data-density={density}
      data-cir-density={density}
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
