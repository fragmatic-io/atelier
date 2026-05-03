// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * EmptyState — semantic placeholder. Variants (Wave 6 / P-10): bordered,
 * elevated, ghost (default), tinted.
 *
 * Wave 7b (Vis-3): optional `icon` prop renders a leading illustration
 * icon. Decorative (aria-hidden) — the title already conveys meaning.
 * Sized at `iconSizePx.xl` for the standard layout (the icon is the
 * "hero" element of an empty state's compact form).
 *
 * Wave 11 / Vis-3 finalisation: `icon` accepts a bare string
 * (`<EmptyState icon="inbox">`) or a `{ set, name }` bag.
 *
 * Wave 11 / Vis-5: optional `illustration` prop renders a larger,
 * situation-specific mascot (Linear / Notion grade). Resolved via the
 * pluggable `IllustrationResolver` (mirrors the Vis-3 icon resolver). When
 * the resolver returns `null` the slot is skipped — no broken layout, no
 * placeholder. `icon` and `illustration` are independent: `illustration`
 * takes precedence above the title; if both are supplied the illustration
 * is the hero and the icon is suppressed (to avoid stacking two heroes).
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, contentVariantClass, iconSizePx, type ContentVariant } from './_variants.js';
import { Icon } from './Icon.js';
import { normalizeIconRef, type IconRef } from '../icons/icon-ref.js';
import { useIllustrationResolver } from '../illustrations/context.js';

export type EmptyStateVariant = ContentVariant;

/** Default rendered size (px) for the illustration slot. */
export const EMPTY_STATE_ILLUSTRATION_SIZE = 96;

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * Optional leading illustration icon. Decorative; meaning is in the title.
   * Wave 11 / Vis-3: accepts a bare string (resolved against the default
   * `'lucide'` set) or `{ set, name }` for non-default packs.
   */
  icon?: IconRef;
  /**
   * Optional named illustration. Wave 11 / Vis-5. Resolved via the active
   * `IllustrationResolver` (provider in scope). Falls through to no-op
   * when the resolver doesn't know the name; the slot is simply omitted.
   * Bundled default names: `'inbox-zero' | 'no-results' | 'error' |
   * 'loading' | 'placeholder'` (when the host mounts
   * `createDefaultIllustrationResolver()`).
   */
  illustration?: string;
  /**
   * Pixel size for the illustration slot (width === height). Default
   * `EMPTY_STATE_ILLUSTRATION_SIZE` (96). Ignored when `illustration` is
   * not set.
   */
  illustrationSize?: number;
  variant?: EmptyStateVariant;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  illustration,
  illustrationSize = EMPTY_STATE_ILLUSTRATION_SIZE,
  variant = 'ghost',
  className,
}: EmptyStateProps): ReactNode {
  const illustrationResolver = useIllustrationResolver();
  const illustrationEntry =
    illustration !== undefined ? illustrationResolver.resolve(illustration) : null;
  const showIllustration = illustration !== undefined && illustrationEntry !== null;

  // Suppress the small icon hero when an illustration hero is present —
  // stacking two "hero" elements above the title reads as visual clutter.
  const showIcon = icon !== undefined && !showIllustration;

  return (
    <div
      role="status"
      data-cir-component="EmptyState"
      data-variant={variant}
      className={cn(contentVariantClass[variant], className)}
    >
      {showIllustration ? (
        <div
          data-cir-part="empty-illustration"
          data-illustration-name={illustration}
          style={{
            marginBottom: 12,
            width: illustrationSize,
            height: illustrationSize,
            display: 'inline-block',
            lineHeight: 0,
          }}
          {...(illustrationEntry.label !== undefined
            ? { role: 'img', 'aria-label': illustrationEntry.label }
            : { 'aria-hidden': true })}
          // Resolvers return host-trusted SVG markup; same trust contract
          // as <Icon>. See illustrations/resolver.ts for details.
          dangerouslySetInnerHTML={{ __html: illustrationEntry.svg }}
        />
      ) : null}
      {showIcon
        ? (() => {
            const ref = normalizeIconRef(icon);
            return (
              <div data-cir-part="empty-icon" style={{ marginBottom: 8 }}>
                <Icon set={ref.set} name={ref.name} size={iconSizePx.xl} />
              </div>
            );
          })()
        : null}
      <p data-cir-part="empty-title">{title}</p>
      {description !== undefined ? <p data-cir-part="empty-description">{description}</p> : null}
      {action !== undefined ? <div data-cir-part="empty-action">{action}</div> : null}
    </div>
  );
}
EmptyState.displayName = 'EmptyState';
export function emptyStateTextRender(props: EmptyStateProps): string {
  return props.description !== undefined
    ? `[Empty: ${props.title} — ${props.description}]`
    : `[Empty: ${props.title}]`;
}
export const EmptyStateBinding: ComponentBinding = { id: 'EmptyState', factory: EmptyState };
