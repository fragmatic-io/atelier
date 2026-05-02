// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Breadcrumb — `<nav aria-label="Breadcrumb">` wrapping an `<ol>` of items.
 * The last item is treated as the current page: it is rendered as plain
 * text with `aria-current="page"` (per WAI-ARIA breadcrumb pattern), even
 * if a consumer accidentally passes an `href`. Items are separated by a
 * visual `▸` glyph that is hidden from assistive tech (`aria-hidden`).
 *
 * ## Wave 11 / Nav-4 — drilldown trail
 *
 * Two modes coexist behind one component:
 *  - **Static** (back-compat): pass `items={[{label, href}, …]}`. The
 *    manifest author enumerates the trail; the component renders anchors.
 *  - **Drilldown**: pass `trail={[{label, id}, …]}` plus an `onNavigate`
 *    handler. Each segment becomes a button that fires `onNavigate(seg, i)`
 *    so the host can update its router. The trail itself is opaque to
 *    Atelier — see `serializeTrail` / `parseTrail` in `breadcrumb/trail.ts`
 *    for the URL-shareable wire format. Pair with `useTrail()` from
 *    `@atelier/react` for a turnkey state-on-the-URL setup.
 *
 * If both `items` and `trail` are supplied, `trail` wins. The host can also
 * supply `homeLabel` (default `'Home'`) and a custom `separator` ReactNode.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, navigationVariantClass, type NavigationVariant } from './_variants.js';
import type { TrailSegment } from '../breadcrumb/trail.js';

export type BreadcrumbVariant = NavigationVariant;

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  /**
   * Static enumerated items. Back-compat path; the manifest author owns the
   * full trail. Ignored when `trail` is supplied.
   */
  items?: readonly BreadcrumbItem[];
  /**
   * Drilldown trail (Nav-4). When set, takes precedence over `items`. Each
   * segment becomes a clickable button that fires `onNavigate(seg, idx)`;
   * the last segment is rendered as the current page. The trail itself is
   * opaque — serialize via `serializeTrail` to share via URL.
   */
  trail?: readonly TrailSegment[];
  /**
   * Fires when a non-current trail segment is clicked. The host updates its
   * router (Next.js `router.push`, React Router `navigate`, etc.) plus the
   * URL trail (typically via `useTrail({ syncToUrl: true })`).
   */
  onNavigate?: (segment: TrailSegment, index: number) => void;
  /**
   * Leftmost segment label. Only used when `trail` is supplied AND the trail
   * does not already begin with a "Home" entry. Pass `null` to suppress.
   * Default `'Home'`.
   */
  homeLabel?: string | null;
  /**
   * Optional `href` for the home crown (only when `homeLabel` is rendered).
   * Defaults to `'/'`.
   */
  homeHref?: string;
  /** Visual separator between segments. Defaults to a `›` chevron. */
  separator?: ReactNode;
  className?: string;
  variant?: BreadcrumbVariant;
}

const DEFAULT_SEPARATOR: ReactNode = (
  <span aria-hidden="true" data-cir-part="breadcrumb-separator" style={{ padding: '0 4px' }}>
    {'›'}
  </span>
);

const LEGACY_SEPARATOR: ReactNode = (
  <span aria-hidden="true" data-cir-part="breadcrumb-separator">
    {' ▸ '}
  </span>
);

export function Breadcrumb({
  items,
  trail,
  onNavigate,
  homeLabel = 'Home',
  homeHref = '/',
  separator,
  className,
  variant = 'default',
}: BreadcrumbProps): ReactNode {
  // Drilldown path takes precedence when supplied. Otherwise fall back to
  // the legacy static path (back-compat) so existing manifests keep working.
  if (trail !== undefined) {
    return renderTrail({ trail, onNavigate, homeLabel, homeHref, separator, className, variant });
  }
  return renderStatic({ items: items ?? [], className, variant });
}

interface RenderTrailArgs {
  trail: readonly TrailSegment[];
  onNavigate: ((segment: TrailSegment, index: number) => void) | undefined;
  homeLabel: string | null;
  homeHref: string;
  separator: ReactNode;
  className: string | undefined;
  variant: BreadcrumbVariant;
}

function renderTrail({
  trail,
  onNavigate,
  homeLabel,
  homeHref,
  separator,
  className,
  variant,
}: RenderTrailArgs): ReactNode {
  const sep = separator ?? DEFAULT_SEPARATOR;
  // Only inject a synthetic "Home" entry if the host did not already lead
  // with one. Repeating "Home › Home › …" is the obvious foot-gun.
  const firstLabel = trail[0]?.label.toLowerCase();
  const needsHomeCrown =
    homeLabel !== null && homeLabel !== '' && firstLabel !== homeLabel.toLowerCase();

  // Crown's pseudo-index is -1 so hosts that key handlers off `index` can
  // tell it apart from real trail segments without inspecting the label.
  type Step = { seg: TrailSegment; isCrown: boolean; index: number };
  const steps: Step[] = [];
  if (needsHomeCrown) {
    steps.push({ seg: { label: homeLabel, href: homeHref }, isCrown: true, index: -1 });
  }
  trail.forEach((seg, i) => {
    steps.push({ seg, isCrown: false, index: i });
  });

  return (
    <nav
      aria-label="Breadcrumb"
      data-cir-component="Breadcrumb"
      data-variant={variant}
      data-cir-mode="trail"
      className={cn(navigationVariantClass[variant], className)}
    >
      <ol
        data-cir-part="breadcrumb-list"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {steps.map(({ seg, isCrown, index }, listIdx) => {
          const isLast = listIdx === steps.length - 1;
          const key = `${seg.label}-${seg.id ?? ''}-${String(listIdx)}`;
          return (
            <li
              key={key}
              data-cir-part="breadcrumb-item"
              data-current={isLast ? 'true' : 'false'}
              data-cir-segment-id={seg.id}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              {renderStep(seg, isCrown, index, isLast, onNavigate)}
              {!isLast ? sep : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function renderStep(
  seg: TrailSegment,
  isCrown: boolean,
  index: number,
  isLast: boolean,
  onNavigate: ((segment: TrailSegment, index: number) => void) | undefined,
): ReactNode {
  if (isLast) {
    return (
      <span aria-current="page" data-cir-part="breadcrumb-label">
        {seg.label}
      </span>
    );
  }
  // The crown always renders as an anchor (host wires nav via the href).
  // Trail segments render as a button when an `onNavigate` handler is
  // supplied — buttons keep keyboard activation + focus ring + aria
  // semantics correct for a non-URL action. When `onNavigate` is omitted
  // we fall back to an `<a>` so SSR'd output stays navigable via the
  // segment's optional `href`.
  if (isCrown || onNavigate === undefined) {
    return (
      <a href={seg.href ?? '#'} data-cir-part="breadcrumb-link">
        {seg.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      data-cir-part="breadcrumb-link"
      onClick={() => {
        onNavigate(seg, index);
      }}
      style={{
        background: 'transparent',
        border: 0,
        padding: 0,
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        textDecoration: 'underline',
      }}
    >
      {seg.label}
    </button>
  );
}

interface RenderStaticArgs {
  items: readonly BreadcrumbItem[];
  className: string | undefined;
  variant: BreadcrumbVariant;
}

function renderStatic({ items, className, variant }: RenderStaticArgs): ReactNode {
  return (
    <nav
      aria-label="Breadcrumb"
      data-cir-component="Breadcrumb"
      data-variant={variant}
      className={cn(navigationVariantClass[variant], className)}
    >
      <ol
        data-cir-part="breadcrumb-list"
        style={{ display: 'flex', gap: '6px', listStyle: 'none', margin: 0, padding: 0 }}
      >
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <li
              key={`${it.label}-${String(i)}`}
              data-cir-part="breadcrumb-item"
              data-current={isLast ? 'true' : 'false'}
            >
              {isLast || it.href === undefined ? (
                <span aria-current={isLast ? 'page' : undefined}>{it.label}</span>
              ) : (
                <a href={it.href}>{it.label}</a>
              )}
              {!isLast ? LEGACY_SEPARATOR : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

Breadcrumb.displayName = 'Breadcrumb';

export function breadcrumbTextRender(props: BreadcrumbProps): string {
  const labels =
    props.trail !== undefined
      ? props.trail.map((s) => s.label)
      : (props.items ?? []).map((i) => i.label);
  return `[Breadcrumb: ${labels.join(' > ')}]`;
}

export const BreadcrumbBinding: ComponentBinding = {
  id: 'Breadcrumb',
  factory: Breadcrumb,
};
