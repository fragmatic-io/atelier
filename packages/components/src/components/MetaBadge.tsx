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
 * Variants reuse the standard severity tokens (info/success/warning/danger)
 * via the `metaBadgeVariantClass` table; `default` is a neutral gray pill;
 * `live` adds a cyan accent for streaming / "live" / unread indicators.
 *
 * Composition role: leaf — no children. The pill's content comes from
 * props, not from manifest children.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, metaBadgeVariantClass, type MetaBadgeVariant } from './_variants.js';

export type { MetaBadgeVariant } from './_variants.js';

export interface MetaBadgeProps {
  /** Text label (e.g., "unread", "API"). */
  label?: string;
  /** Numeric badge (e.g., 5 unread). Renders as `${count}` or `${count} ${label}`. */
  count?: number;
  /** Severity / state token. Defaults to 'default'. */
  variant?: MetaBadgeVariant;
  /** When true, prepends a small colored dot before the content. Useful for "live" / pulse indicators. */
  dot?: boolean;
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
  className,
}: MetaBadgeProps): ReactNode {
  const content = composeContent(count, label);
  const hasContent = content.length > 0;

  // No content and no dot → render nothing rather than an empty host span.
  if (!hasContent && !dot) return null;

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
      'leading dot indicator. Variants: default | info | success | warning | danger | live. ' +
      'Subsumes the ad-hoc `<small>` + tinted-span pattern demos used to hand-roll for cart quota ' +
      'chips, "live" pills, and unread counts. Returns null when neither label/count nor dot is set.',
    allowed_props: {
      label: 'string',
      count: 'number',
      variant: 'string',
      dot: 'boolean',
      className: 'string',
    },
  },
};
