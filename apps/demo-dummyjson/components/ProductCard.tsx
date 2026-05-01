// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `ProductCard` — single-product card used by `<ProductGrid>` (manifest-driven)
 * and the product detail page rail.
 *
 * Renders, top to bottom:
 *   - thumbnail (16:9 aspect-ratio image, fallback to a tinted placeholder)
 *   - brand + title
 *   - rating row (★ + value, count)
 *   - price block — emphasis price with optional strike-through original
 *     and a "Save NN%" pill when `discountPercentage > 0` (Marigold's
 *     `price.savings` token)
 *   - "Add to cart" button (primary; tints `confirm` on optimistic success)
 *
 * Three density variants reshape the card:
 *   - `compact`   — single horizontal row (32px thumb + title + price + btn)
 *   - `comfortable` — full vertical card (default)
 *   - `spacious`  — same as comfortable but with a taller thumb and larger
 *     padding; used at lens=spacious in the 2-column grid.
 *
 * Voice: button label leads with the verb ("Add to cart"); confirmation
 * tone is celebratory but quiet ("Added · undo for 5s"). See
 * `lib/brand-kit.ts` voice tokens.
 *
 * State: this component is presentational. Add-to-cart state (the 5-second
 * "Added" badge) lives on `<ProductGrid>` so the row stays in sync with
 * the floating undo toast even after re-render.
 */

import type { CSSProperties, ReactNode } from 'react';

export interface DummyJsonProduct {
  id: number;
  title: string;
  description?: string;
  brand?: string;
  category?: string;
  price: number;
  /** dummyjson surfaces this as "percent off the listed price". */
  discountPercentage?: number;
  rating?: number;
  stock?: number;
  thumbnail?: string;
  images?: readonly string[];
}

export type ProductCardDensity = 'compact' | 'comfortable' | 'spacious';

export interface ProductCardProps {
  product: DummyJsonProduct;
  density?: ProductCardDensity;
  /** True while the optimistic "Added" badge should show. */
  added?: boolean;
  /** Click handler — receives the product. */
  onAdd?: (product: DummyJsonProduct) => void;
  /** When set, wraps the card body in an anchor to the product detail page. */
  href?: string;
}

/** Format a number as USD with two decimals. */
function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Compute the pre-discount price the percentage references. */
function originalPrice(p: DummyJsonProduct): number | null {
  const pct = p.discountPercentage ?? 0;
  if (pct <= 0) return null;
  // dummyjson's `price` is the post-discount price; back into the original.
  return p.price / (1 - pct / 100);
}

function StarRow({ rating, count }: { rating: number; count?: number }): ReactNode {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <div
      data-cir-part="rating"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'inline-block',
          color: 'var(--cir-color-fg-subtle)',
          letterSpacing: 1,
        }}
      >
        ★★★★★
        <span
          style={{
            position: 'absolute',
            inset: 0,
            color: '#f5b400',
            width: `${pct}%`,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          ★★★★★
        </span>
      </span>
      <span style={{ color: 'var(--cir-color-fg-muted)' }} className="cir-mono">
        {rating.toFixed(1)}
        {typeof count === 'number' ? ` (${count})` : ''}
      </span>
    </div>
  );
}

function Thumbnail({
  src,
  alt,
  height,
}: {
  src: string | undefined;
  alt: string;
  height: number;
}): ReactNode {
  const style: CSSProperties = {
    width: '100%',
    height,
    borderRadius: 'var(--cir-radius-md)',
    background: 'var(--cir-color-bg-subtle)',
    objectFit: 'contain',
    display: 'block',
  };
  if (!src) {
    return <div data-cir-part="thumb-placeholder" style={style} aria-hidden="true" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img data-cir-part="thumb" src={src} alt={alt} loading="lazy" style={style} />;
}

export function ProductCard({
  product,
  density = 'comfortable',
  added = false,
  onAdd,
  href,
}: ProductCardProps): ReactNode {
  const orig = originalPrice(product);
  const hasDiscount = orig !== null && (product.discountPercentage ?? 0) > 0.5;
  const outOfStock = (product.stock ?? 1) === 0;

  const cardStyle: CSSProperties = {
    background: 'var(--cir-color-bg-card)',
    border: '1px solid var(--cir-color-border-subtle)',
    borderRadius: 'var(--cir-radius-lg)',
    padding: density === 'compact' ? 10 : density === 'spacious' ? 20 : 14,
    boxShadow: 'var(--cir-shadow-sm)',
    transition: 'box-shadow 220ms var(--cir-ease-out), transform 220ms var(--cir-ease-out)',
    display: 'flex',
    flexDirection: density === 'compact' ? 'row' : 'column',
    alignItems: density === 'compact' ? 'center' : 'stretch',
    gap: density === 'compact' ? 12 : density === 'spacious' ? 14 : 10,
    height: '100%',
  };

  const handleAdd = (): void => {
    if (outOfStock) return;
    onAdd?.(product);
  };

  const titleLabel = (
    <div style={{ minWidth: 0, flex: 1 }}>
      {product.brand ? (
        <div
          data-cir-part="brand"
          style={{
            fontSize: 11,
            color: 'var(--cir-color-fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {product.brand}
        </div>
      ) : null}
      <div
        data-cir-part="title"
        style={{
          fontSize: density === 'compact' ? 13 : 14,
          fontWeight: 600,
          color: 'var(--cir-color-fg)',
          lineHeight: 1.3,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: density === 'compact' ? 1 : 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {href ? (
          <a href={href} style={{ color: 'inherit' }}>
            {product.title}
          </a>
        ) : (
          product.title
        )}
      </div>
    </div>
  );

  const priceBlock = (
    <div
      data-cir-part="price"
      style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}
    >
      <span
        className="cir-mono"
        style={{
          fontSize: density === 'compact' ? 14 : density === 'spacious' ? 22 : 18,
          fontWeight: 700,
          color: 'var(--cir-color-fg)',
        }}
      >
        {formatPrice(product.price)}
      </span>
      {hasDiscount && orig !== null ? (
        <>
          <span
            className="cir-mono"
            style={{
              fontSize: 12,
              color: 'var(--cir-color-fg-muted)',
              textDecoration: 'line-through',
            }}
          >
            {formatPrice(orig)}
          </span>
          <span
            data-cir-part="savings-pill"
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 'var(--cir-radius-full)',
              background: 'var(--cir-color-success-subtle)',
              color: 'var(--cir-color-success)',
            }}
          >
            Save {Math.round(product.discountPercentage ?? 0)}%
          </span>
        </>
      ) : null}
    </div>
  );

  const addButton = (
    <button
      type="button"
      onClick={handleAdd}
      disabled={outOfStock || added}
      data-cir-part="add-to-cart"
      data-cir-state={added ? 'added' : outOfStock ? 'oos' : 'idle'}
      style={{
        flexShrink: 0,
        appearance: 'none',
        border: 0,
        borderRadius: 'var(--cir-radius-md)',
        padding: density === 'compact' ? '6px 10px' : '8px 14px',
        fontSize: density === 'compact' ? 12 : 13,
        fontWeight: 600,
        cursor: outOfStock ? 'not-allowed' : 'pointer',
        background: added
          ? 'var(--cir-color-success-subtle)'
          : outOfStock
            ? 'var(--cir-color-bg-muted)'
            : 'var(--cir-color-primary)',
        color: added
          ? 'var(--cir-color-success)'
          : outOfStock
            ? 'var(--cir-color-fg-muted)'
            : 'var(--cir-color-fg-on-primary)',
        transition: 'background 140ms var(--cir-ease-out)',
      }}
    >
      {added ? 'Added' : outOfStock ? 'Sold out' : 'Add to cart'}
    </button>
  );

  if (density === 'compact') {
    // Single-row layout: thumb / title / price / button.
    return (
      <article
        data-cir-component="ProductCard"
        data-cir-density="compact"
        data-cir-product-id={product.id}
        style={cardStyle}
      >
        <div style={{ width: 56, height: 56, flexShrink: 0 }}>
          <Thumbnail src={product.thumbnail} alt={product.title} height={56} />
        </div>
        {titleLabel}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {priceBlock}
        </div>
        {addButton}
      </article>
    );
  }

  // comfortable / spacious vertical card.
  const thumbHeight = density === 'spacious' ? 220 : 160;
  return (
    <article
      data-cir-component="ProductCard"
      data-cir-density={density}
      data-cir-product-id={product.id}
      style={cardStyle}
    >
      <Thumbnail src={product.thumbnail} alt={product.title} height={thumbHeight} />
      {titleLabel}
      {typeof product.rating === 'number' ? (
        <StarRow rating={product.rating} count={product.stock} />
      ) : null}
      {priceBlock}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {addButton}
      </div>
    </article>
  );
}
ProductCard.displayName = 'ProductCard';
