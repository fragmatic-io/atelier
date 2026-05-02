// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `<Icon>` — visual primitive that renders an SVG sourced from a host-
 * provided `IconResolver`. Wave 7b (Vis-3).
 *
 * The component itself owns NO icons; it reads `IconResolverContext` and
 * asks the host for `(set, name)`. If the resolver returns `null`, a
 * layout-stable placeholder span is rendered (so missing icons don't
 * collapse layouts). Otherwise the SVG markup is injected via
 * `dangerouslySetInnerHTML`.
 *
 * Why `dangerouslySetInnerHTML` is acceptable here: the resolver is the
 * host's contract. Hosts choose what SVGs they expose; the strings are
 * trusted by construction. Never wire an `IconResolver` whose source is
 * untrusted (e.g. user-typed SVG markup) without sanitising upstream.
 *
 * Brand integration: when an `IconBrandProvider` is in scope, the `size`
 * prop is clamped to at least `config.minimumSize`. This honours
 * `BrandIconographySchema.minimum_size` from `@atelier/schemas`.
 *
 * Accessibility: pass `ariaLabel` for a meaningful icon (sets `role="img"`
 * + `aria-label`). Omit it for a decorative icon (sets `aria-hidden="true"`).
 */
import { type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { useIconResolver } from '../icons/context.js';
import { useIconBrand } from '../icons/brand-context.js';

export interface IconProps {
  /** Icon-pack id, e.g. `'lucide'`. Must match a key the host's resolver knows about. */
  set: string;
  /** Icon name within the pack, e.g. `'archive'`. */
  name: string;
  /** Pixel size for both width and height. Default `16`. Clamped up by brand `minimumSize` if present. */
  size?: number;
  /** Stroke width for stroke-based icons. Default `1.75`. Applied via inline `style.strokeWidth`. */
  strokeWidth?: number;
  /** When provided, sets `role="img"` + `aria-label`. When absent, the icon is `aria-hidden`. */
  ariaLabel?: string;
  className?: string;
}

export const ICON_DEFAULT_SIZE = 16;
export const ICON_DEFAULT_STROKE_WIDTH = 1.75;

export function Icon({
  set,
  name,
  size = ICON_DEFAULT_SIZE,
  strokeWidth = ICON_DEFAULT_STROKE_WIDTH,
  ariaLabel,
  className,
}: IconProps): ReactNode {
  const resolver = useIconResolver();
  const brand = useIconBrand();
  const minimum = brand?.minimumSize;
  const effectiveSize =
    typeof minimum === 'number' && Number.isFinite(minimum) && size < minimum ? minimum : size;

  const svg = resolver.resolve(set, name);
  const a11y =
    ariaLabel !== undefined
      ? ({ role: 'img', 'aria-label': ariaLabel } as const)
      : ({ 'aria-hidden': true } as const);

  // Layout-stable placeholder when the resolver doesn't know this (set,name).
  if (svg === null) {
    return (
      <span
        data-cir-component="Icon"
        data-icon-set={set}
        data-icon-name={name}
        data-icon-missing="true"
        className={className}
        style={{
          display: 'inline-block',
          width: effectiveSize,
          height: effectiveSize,
        }}
        {...a11y}
      />
    );
  }

  const style: CSSProperties = {
    display: 'inline-block',
    width: effectiveSize,
    height: effectiveSize,
    // Applied conditionally so a fill-only SVG isn't accidentally restyled.
    strokeWidth,
    lineHeight: 0,
  };

  return (
    <span
      data-cir-component="Icon"
      data-icon-set={set}
      data-icon-name={name}
      className={className}
      style={style}
      // Resolvers return host-trusted SVG markup; see file-level JSDoc.
      dangerouslySetInnerHTML={{ __html: svg }}
      {...a11y}
    />
  );
}
Icon.displayName = 'Icon';

export function iconTextRender(props: Partial<IconProps>): string {
  const set = props.set ?? '?';
  const name = props.name ?? '?';
  return `[icon: ${set}:${name}]`;
}

export const IconBinding: ComponentBinding = { id: 'Icon', factory: Icon };
