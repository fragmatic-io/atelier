// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

/**
 * MetaBadge — small inline status pill that surfaces a count, label,
 * severity, or "live"/"unread" state.
 *
 * Marketplace pivot — collapses the ad-hoc `<small>` + tinted-span pattern
 * the demos repeatedly hand-rolled (cart-add quota chip, "live" pill,
 * unread counts, "API" tag) onto a single composable primitive. With this
 * in baseline the LLM picks `<MetaBadge variant="live" dot />` instead of
 * gluing inline styles onto raw spans.
 *
 * Display modes (driven by which props are supplied):
 *   - `count` only             → numeric pill (e.g. "5")
 *   - `label` only             → text pill (e.g. "API")
 *   - both                     → `${count} ${label}` (e.g. "5 unread")
 *   - `dot` true, no content   → just a colored circle indicator
 *   - none of the above        → returns null (no empty host element)
 *
 * Wave 11 / Vis-3: optional `icon` prop renders a leading icon BEFORE the
 * dot/content. Sized down to `iconSizePx.xs` (12px) and given a thinner
 * stroke (1.5) to match the badge's compact density. Accepts a bare string
 * (`<MetaBadge icon="circle-dot" label="online">`) or a `{ set, name }` bag.
 *
 * Variants reuse the standard severity tokens (info/success/warning/danger)
 * via the `metaBadgeVariantClass` table; `default` is a neutral gray pill;
 * `live` adds a cyan accent for streaming / "live" / unread indicators.
 *
 * Composition role: leaf — no children. The pill's content comes from
 * props, not from manifest children.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, iconSizePx, metaBadgeVariantClass, type MetaBadgeVariant } from './_variants.js';
import { Icon } from './Icon.js';
import { normalizeIconRef, type IconRef } from '../icons/icon-ref.js';

export type { MetaBadgeVariant } from './_variants.js';

/**
 * Stroke width applied to MetaBadge icons. Slightly thinner than the
 * `<Icon>` default (1.75) so the icon doesn't visually outweigh the
 * 11px badge text at compact density.
 */
const META_BADGE_ICON_STROKE_WIDTH = 1.5;

export interface MetaBadgeProps {
  /** Text label (e.g., "unread", "API"). */
  label?: string;
  /** Numeric badge (e.g., 5 unread). Renders as `${count}` or `${count} ${label}`. */
  count?: number;
  /** Severity / state token. Defaults to 'default'. */
  variant?: MetaBadgeVariant;
  /** When true, prepends a small colored dot before the content. Useful for "live" / pulse indicators. */
  dot?: boolean;
  /**
   * Optional leading icon. Decorative; rendered before the dot/content at
   * `iconSizePx.xs` (12px) with a thinner stroke (1.5) to match badge
   * density. Accepts a bare string (`'circle-dot'`) or a `{ set, name }` bag.
   */
  icon?: IconRef;
  className?: string;
}

/**
 * Compose the badge's text content from `count` / `label`. Returns the empty
 * string when neither is supplied so the caller can decide whether to render
 * a dot-only badge or nothing at all.
 */
function composeContent(count?: number, label?: string): string {
  const hasCount = typeof count === 'number';
  const hasLabel = typeof label === 'string' && label.length > 0;
  if (hasCount && hasLabel) return `${String(count)} ${label}`;
  if (hasCount) return String(count);
  if (hasLabel) return label;
  return '';
}

export function MetaBadge({
  label,
  count,
  variant = 'default',
  dot = false,
  icon,
  className,
}: MetaBadgeProps): ReactNode {
  const content = composeContent(count, label);
  const hasContent = content.length > 0;
  const hasIcon = icon !== undefined;

  // No content, no dot, no icon → render nothing rather than an empty host
  // span. (Authors that want an icon-only chip get it because `hasIcon`
  // keeps the badge alive.)
  if (!hasContent && !dot && !hasIcon) return null;

  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: hasContent ? '1px 6px' : '2px',
    borderRadius: '9999px',
    fontSize: '11px',
    lineHeight: 1.4,
    fontWeight: 500,
    verticalAlign: 'middle',
  };

  return (
    <span
      data-cir-component="MetaBadge"
      data-variant={variant}
      data-dot={dot ? 'true' : 'false'}
      className={cn(metaBadgeVariantClass[variant], className)}
      style={pillStyle}
    >
      {hasIcon
        ? (() => {
            const ref = normalizeIconRef(icon);
            return (
              <span data-cir-part="metabadge-icon" style={{ display: 'inline-flex' }}>
                <Icon
                  set={ref.set}
                  name={ref.name}
                  size={iconSizePx.xs}
                  strokeWidth={META_BADGE_ICON_STROKE_WIDTH}
                />
              </span>
            );
          })()
        : null}
      {dot ? (
        <span
          data-cir-part="metabadge-dot"
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '9999px',
            backgroundColor: 'currentColor',
            flex: '0 0 auto',
          }}
        />
      ) : null}
      {hasContent ? <span data-cir-part="metabadge-content">{content}</span> : null}
    </span>
  );
}

MetaBadge.displayName = 'MetaBadge';

export function metaBadgeTextRender(props: MetaBadgeProps): string {
  const countStr = typeof props.count === 'number' ? String(props.count) : '';
  const labelStr = typeof props.label === 'string' ? props.label : '';
  const inner = `${countStr}${countStr.length > 0 && labelStr.length > 0 ? ' ' : ''}${labelStr}`;
  return inner.length > 0 ? `[MetaBadge: ${inner}]` : '[MetaBadge]';
}

export const MetaBadgeBinding: ComponentBinding = {
  id: 'MetaBadge',
  factory: MetaBadge as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Small inline status pill for counts, labels, severity, or "live"/"unread" state. ' +
      'Renders `${count}`, `${label}`, or `${count} ${label}` (e.g. "5 unread") with an optional ' +
      'leading dot indicator and an optional leading `icon` (lucide kebab-case name). ' +
      'Variants: default | info | success | warning | danger | live. ' +
      'Subsumes the ad-hoc `<small>` + tinted-span pattern demos used to hand-roll for cart quota ' +
      'chips, "live" pills, and unread counts. Returns null when neither label/count, dot, nor icon is set.',
    allowed_props: {
      label: 'string',
      count: 'number',
      variant: 'string',
      dot: 'boolean',
      // `icon` is `string | { set, name }`; the contract type tag is a
      // single string, so we use `'unknown'` to permit either shape.
      icon: 'unknown',
      className: 'string',
    },
  },
};
