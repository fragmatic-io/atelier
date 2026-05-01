// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Card — bounded content container with optional header.
 *
 * Variants (Wave 6 / P-10): bordered (default), elevated, ghost, tinted.
 *
 * Marketplace pivot — `<Card>` grew a tile-shaped persona so demos can
 * collapse per-host product / item / catalog cards onto baseline. The same
 * binding now serves two compositions:
 *
 *   1. **Legacy bordered surface** — `title` + (optional `actions` ReactNode
 *      header slot) + children body. Pre-pivot behaviour, preserved
 *      verbatim when none of the tile props are supplied.
 *   2. **Self-contained tile** — `image` / `title` / `subtitle` / `price` /
 *      `badge` (rendered top-to-bottom) + a footer row of declarative
 *      `actions: CardAction[]` buttons. The runtime resolves the manifest's
 *      capability `node.actions` into `props.onAction(actionId, item)` via
 *      `actionSlots: ['onAction']` (mirrors `<Queue>`); the Card dispatches
 *      its declared button id through that single slot.
 *
 * Per-tile fields (`image`, `subtitle`, `price`, `badge`) are first-class
 * props rather than children so a `<Grid data={products}>` can render one
 * `<Card>` per item with sensible defaults pulled from the item shape
 * (`thumbnail`, `title`, `brand`, `price`, `discountPercentage`) without
 * the manifest having to author a per-cell template.
 */
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { MetaBadge } from './MetaBadge.js';
import {
  cn,
  layoutVariantClass,
  actionVariantClass,
  type LayoutVariant,
  type ActionVariant,
} from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_PADDING_PX, type Density } from './density.js';

export type CardVariant = LayoutVariant;

/**
 * Declarative per-card action button. Mirrors `QueueAction` — `id` is the
 * capability dot-path the manifest publishes; the runtime wires
 * `onAction(actionId, item)` through the action registry so hosts never
 * plumb dispatchers per-button.
 */
export interface CardAction {
  /** Capability dot-path, e.g. `'dummyjson.cart.add'`. */
  id: string;
  /** Button label. */
  label: string;
  /** Visual variant (defaults to 'primary' for the first action, 'secondary' otherwise). */
  variant?: ActionVariant;
}

export interface CardProps {
  title?: string;
  /**
   * Either a legacy `ReactNode` actions slot (rendered in the header next to
   * the title) or a declarative `CardAction[]` (rendered as a footer row of
   * buttons that dispatch through `onAction`). The two forms are mutually
   * exclusive: an array is treated as the new declarative form, anything
   * else is the legacy header slot.
   */
  actions?: ReactNode | readonly CardAction[];
  /**
   * Action slot — runtime-wired. Set automatically when the manifest declares
   * `actions: ['cap.id', ...]` and the binding has `actionSlots: ['onAction']`.
   * Receives the clicked action's id and the row item (`data` prop) when the
   * Card was rendered as part of a data-bound `<Grid>`.
   */
  onAction?: (actionId: string, item?: unknown) => Promise<void> | void;
  /**
   * Resolver-supplied row item. When `<Grid data={...}>` renders one Card
   * per item, the renderer threads each item via this prop. Default content
   * render reaches for product-shape fields (title, brand, thumbnail, …) when
   * the surrounding manifest declares no per-card template.
   */
  data?: unknown;
  /** Top-of-card image (rendered as `<img>`) when supplied. */
  image?: string;
  /** Small muted line under the title. */
  subtitle?: string;
  /** Bold price line under the subtitle. Strings render verbatim; numbers format as `$N.NN`. */
  price?: string | number;
  /** Top-right `<MetaBadge>` pill (e.g. "Save 20%"). */
  badge?: string;
  /** Variant for the badge (defaults to 'success' for save/discount-style copy). */
  badgeVariant?: 'default' | 'info' | 'success' | 'warning' | 'danger' | 'live';
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: CardVariant;
  className?: string;
  children?: ReactNode;
}

/** Format a JS number as USD with two decimals. Strings pass through unchanged. */
function formatPrice(value: string | number): string {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return String(value);
  return `$${value.toFixed(2)}`;
}

/**
 * Type guard — narrows `actions` to the declarative `CardAction[]` shape.
 * Anything else is treated as a legacy ReactNode header slot.
 */
function isCardActionList(value: unknown): value is readonly CardAction[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  const first = value[0] as unknown;
  return (
    typeof first === 'object' &&
    first !== null &&
    typeof (first as { id?: unknown }).id === 'string' &&
    typeof (first as { label?: unknown }).label === 'string'
  );
}

/**
 * Pull a string-ish value from `item[key]` in a defensive way. Returns
 * `undefined` when the item isn't an object or the field isn't a string.
 */
function readString(item: unknown, key: string): string | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const v = (item as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readNumber(item: unknown, key: string): number | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const v = (item as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Tile-mode field resolver. When `<Grid data={items}>` renders a Card per
 * item without a manifest-supplied template, the Card defaults each tile
 * field by reaching into the item shape — `thumbnail` / `images[0]` for
 * the image, `title` / `name` for the heading, `brand` / `category` for
 * the subtitle, `price` for the price line, and a "Save NN%" badge when
 * `discountPercentage > 0`.
 */
function resolveTileDefaults(
  data: unknown,
  explicit: {
    image: string | undefined;
    title: string | undefined;
    subtitle: string | undefined;
    price: string | number | undefined;
    badge: string | undefined;
  },
): {
  image: string | undefined;
  title: string | undefined;
  subtitle: string | undefined;
  price: string | number | undefined;
  badge: string | undefined;
} {
  if (typeof data !== 'object' || data === null) return explicit;
  const item = data as Record<string, unknown>;

  let image = explicit.image;
  if (image === undefined) {
    image = readString(data, 'thumbnail') ?? readString(data, 'image');
    if (image === undefined && Array.isArray(item['images'])) {
      const first = (item['images'] as unknown[])[0];
      if (typeof first === 'string' && first.length > 0) image = first;
    }
  }

  const title = explicit.title ?? readString(data, 'title') ?? readString(data, 'name');
  const subtitle = explicit.subtitle ?? readString(data, 'brand') ?? readString(data, 'category');

  let price: string | number | undefined = explicit.price;
  if (price === undefined) {
    const n = readNumber(data, 'price');
    if (n !== undefined) price = n;
  }

  let badge = explicit.badge;
  if (badge === undefined) {
    const pct = readNumber(data, 'discountPercentage');
    if (pct !== undefined && pct >= 1) badge = `Save ${String(Math.round(pct))}%`;
  }

  return { image, title, subtitle, price, badge };
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    title: titleProp,
    actions,
    onAction,
    data,
    image: imageProp,
    subtitle: subtitleProp,
    price: priceProp,
    badge: badgeProp,
    badgeVariant,
    density = DEFAULT_DENSITY,
    variant = 'bordered',
    className,
    children,
  }: CardProps,
  ref,
): ReactNode {
  // Tile-mode field defaults. Explicit props always win; `data` only fills
  // gaps so a manifest can override any single field while letting the rest
  // come from the row item.
  const resolved = resolveTileDefaults(data, {
    image: imageProp,
    title: titleProp,
    subtitle: subtitleProp,
    price: priceProp,
    badge: badgeProp,
  });
  const title = resolved.title;
  const subtitle = resolved.subtitle;
  const price = resolved.price;
  const badge = resolved.badge;
  const image = resolved.image;

  const declarativeActions = isCardActionList(actions) ? actions : undefined;
  const headerActionsNode = declarativeActions === undefined ? (actions as ReactNode) : undefined;

  const padPx = DENSITY_PADDING_PX[density];
  const bodyStyle: CSSProperties = { padding: `${String(padPx)}px` };
  const headerStyle: CSSProperties = {
    padding: `${String(padPx)}px`,
    paddingBottom: `${String(Math.max(0, padPx - 2))}px`,
  };

  const isTile =
    image !== undefined ||
    subtitle !== undefined ||
    price !== undefined ||
    badge !== undefined ||
    (declarativeActions !== undefined && declarativeActions.length > 0);

  // Legacy path — title + ReactNode actions header + children body.
  // Preserved verbatim so pre-pivot Card callers keep working.
  if (!isTile) {
    const hasHeader = title !== undefined || headerActionsNode !== undefined;
    return (
      <section
        ref={ref}
        data-cir-component="Card"
        data-density={density}
        data-variant={variant}
        className={cn(layoutVariantClass[variant], className)}
        aria-label={title}
      >
        {hasHeader ? (
          <header data-cir-part="card-header" style={headerStyle}>
            {title !== undefined ? <h3 data-cir-part="card-title">{title}</h3> : null}
            {headerActionsNode !== undefined ? (
              <div data-cir-part="card-actions">{headerActionsNode}</div>
            ) : null}
          </header>
        ) : null}
        <div data-cir-part="card-body" style={bodyStyle}>
          {children}
        </div>
      </section>
    );
  }

  // Tile path. Layout: image (top) → header row (title + badge) → subtitle
  // → price → optional children body → footer action buttons.
  const handleClick = (action: CardAction): void => {
    if (onAction === undefined) return;
    void onAction(action.id, data);
  };

  return (
    <section
      ref={ref}
      data-cir-component="Card"
      data-density={density}
      data-variant={variant}
      data-cir-tile="true"
      className={cn(layoutVariantClass[variant], className)}
      aria-label={title}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {image !== undefined ? (
        <img
          data-cir-part="card-image"
          src={image}
          alt={title ?? ''}
          loading="lazy"
          style={{
            width: '100%',
            display: 'block',
            objectFit: 'cover',
            aspectRatio: '16 / 10',
          }}
        />
      ) : null}
      {title !== undefined || badge !== undefined ? (
        <header
          data-cir-part="card-header"
          style={{
            ...headerStyle,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          {title !== undefined ? (
            <h3 data-cir-part="card-title" style={{ margin: 0, minWidth: 0, flex: 1 }}>
              {title}
            </h3>
          ) : null}
          {badge !== undefined ? (
            <MetaBadge label={badge} variant={badgeVariant ?? 'success'} />
          ) : null}
        </header>
      ) : null}
      {subtitle !== undefined || price !== undefined || children !== undefined ? (
        <div data-cir-part="card-body" style={bodyStyle}>
          {subtitle !== undefined ? (
            <div
              data-cir-part="card-subtitle"
              style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}
            >
              {subtitle}
            </div>
          ) : null}
          {price !== undefined ? (
            <div
              data-cir-part="card-price"
              style={{ fontSize: '16px', fontWeight: 700, marginTop: '4px' }}
            >
              {formatPrice(price)}
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
      {declarativeActions !== undefined && declarativeActions.length > 0 ? (
        <footer
          data-cir-part="card-footer"
          style={{
            padding: `${String(Math.max(0, padPx - 2))}px ${String(padPx)}px ${String(padPx)}px`,
            display: 'flex',
            gap: '8px',
            marginTop: 'auto',
          }}
        >
          {declarativeActions.map((action, i) => (
            <button
              key={action.id}
              type="button"
              data-cir-part="card-action"
              data-action-id={action.id}
              className={cn(
                actionVariantClass[action.variant ?? (i === 0 ? 'primary' : 'secondary')],
              )}
              disabled={onAction === undefined}
              onClick={(): void => {
                handleClick(action);
              }}
            >
              {action.label}
            </button>
          ))}
        </footer>
      ) : null}
    </section>
  );
});

export function cardTextRender(props: CardProps): string {
  const data = props.data;
  const title =
    props.title ??
    (typeof data === 'object' && data !== null
      ? (readString(data, 'title') ?? readString(data, 'name'))
      : undefined);
  return title !== undefined ? `[Card: ${title}]` : '[Card]';
}
export const CardBinding: ComponentBinding = {
  id: 'Card',
  factory: Card,
  actionSlots: ['onAction'],
  manifestContract: {
    description:
      'Bounded content surface. Two compositions: (1) legacy bordered surface — `title` + ' +
      'optional ReactNode `actions` header slot + children body; (2) self-contained tile — ' +
      '`image` (top), `title`, `subtitle`, `price`, `badge` (`<MetaBadge>` pill), and a footer ' +
      'row of declarative `actions: CardAction[]` buttons. Tile mode activates when any of ' +
      '`image`/`subtitle`/`price`/`badge`/`actions` (declarative) are supplied. When a parent ' +
      '`<Grid data={items}>` renders one Card per item, the row is threaded via the `data` prop ' +
      'and the Card defaults each tile field from common product-shape fields (`title`, `brand`, ' +
      '`thumbnail`, `images[0]`, `price`, `discountPercentage`). The runtime wires ' +
      "`onAction(actionId, item)` from the manifest's capability list via `actionSlots: ['onAction']`.",
    allowed_props: {
      title: 'string',
      actions: 'unknown',
      onAction: 'function',
      data: 'unknown',
      image: 'string',
      subtitle: 'string',
      price: 'unknown',
      badge: 'string',
      badgeVariant: 'string',
      density: 'string',
      variant: 'string',
      className: 'string',
    },
  },
};
