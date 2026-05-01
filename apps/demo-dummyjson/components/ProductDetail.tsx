// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `ProductDetail` — manifest-bound single-product surface for `/product/[id]`.
 * The walker resolves `data: { source: 'dummyjson.product.list', filter: 'id = N' }`
 * — the dummyjson API does not expose a single-product fetch via that
 * binding, so the resolver hits `/products/{id}` and returns a single
 * `DummyJsonProduct` envelope.
 *
 * Renders:
 *   - large gallery (primary image + thumbnail row)
 *   - title + brand + rating
 *   - price (with optional discount)
 *   - description prose
 *   - "Add to cart" + qty selector
 *   - Stock indicator
 *
 * Reversibility: tapping "Add to cart" raises the same 5-second undo toast
 * as the catalog; nothing in the body needs to surface it again.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDispatcher } from '@cir/react';
import type { Density } from '@cir/components';
import type { DummyJsonProduct } from './ProductCard.js';

export interface ProductDetailProps {
  data?: DummyJsonProduct | null;
  loading?: boolean;
  error?: Error | null;
  density?: Density;
  ['dummyjson.cart.add']?: (input: { product_id: number; quantity: number }) => unknown;
}

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

interface UndoState {
  at: number;
  qty: number;
}

export function ProductDetail({
  data,
  loading,
  error,
  density: _density = 'comfortable',
  ...rest
}: ProductDetailProps): ReactNode {
  const dispatch = useDispatcher();
  const onAddProp = (rest as Record<string, unknown>)['dummyjson.cart.add'] as
    | ((input: { product_id: number; quantity: number }) => unknown)
    | undefined;

  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return (): void => {
      if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    };
  }, []);

  if (loading && !data) return <DetailSkeleton />;
  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: 16,
          borderRadius: 'var(--cir-radius-lg)',
          background: 'color-mix(in srgb, var(--cir-color-danger) 10%, transparent)',
          color: 'var(--cir-color-danger)',
        }}
      >
        Couldn’t load that product — {error.message}
      </div>
    );
  }
  if (!data) {
    return (
      <div
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--cir-color-bg-subtle)',
          borderRadius: 'var(--cir-radius-lg)',
          color: 'var(--cir-color-fg-muted)',
        }}
      >
        <div
          style={{ fontSize: 16, fontWeight: 600, color: 'var(--cir-color-fg)', marginBottom: 6 }}
        >
          Product not found
        </div>
        <a
          href="/browse"
          style={{
            display: 'inline-block',
            marginTop: 12,
            padding: '8px 14px',
            borderRadius: 'var(--cir-radius-md)',
            background: 'var(--cir-color-primary)',
            color: 'var(--cir-color-fg-on-primary)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Back to browse
        </a>
      </div>
    );
  }

  const product = data;
  const images =
    product.images && product.images.length > 0
      ? product.images
      : product.thumbnail
        ? [product.thumbnail]
        : [];
  const visible = images[activeImage] ?? product.thumbnail ?? '';
  const orig = product.discountPercentage
    ? product.price / (1 - product.discountPercentage / 100)
    : null;
  const outOfStock = (product.stock ?? 1) === 0;

  const handleAdd = (): void => {
    const input = { product_id: product.id, quantity: qty };
    setUndoState({ at: Date.now(), qty });
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoState(null);
    }, 5000);
    const result = onAddProp ? onAddProp(input) : dispatch('dummyjson.cart.add', input);
    Promise.resolve(result).catch(() => {
      setUndoState(null);
    });
  };

  return (
    <div data-cir-component="ProductDetail" data-cir-product-id={product.id}>
      <div
        data-cir-part="layout"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
          gap: 32,
          alignItems: 'start',
        }}
      >
        <div data-cir-part="gallery">
          <div
            style={{
              background: 'var(--cir-color-bg-subtle)',
              borderRadius: 'var(--cir-radius-lg)',
              padding: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 360,
            }}
          >
            {visible ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={visible}
                alt={product.title}
                style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }}
              />
            ) : null}
          </div>
          {images.length > 1 ? (
            <div
              data-cir-part="thumbnails"
              style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto' }}
            >
              {images.slice(0, 6).map((src, i) => (
                <button
                  key={src + String(i)}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  data-active={activeImage === i}
                  style={{
                    appearance: 'none',
                    border:
                      activeImage === i
                        ? '2px solid var(--cir-color-primary)'
                        : '1px solid var(--cir-color-border-default)',
                    background: 'var(--cir-color-bg-card)',
                    borderRadius: 'var(--cir-radius-md)',
                    padding: 4,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  aria-label={`View image ${String(i + 1)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    aria-hidden="true"
                    style={{ width: 56, height: 56, objectFit: 'contain', display: 'block' }}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div data-cir-part="info">
          {product.brand ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--cir-color-fg-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
              }}
            >
              {product.brand}
            </div>
          ) : null}
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: '6px 0 14px',
              color: 'var(--cir-color-fg)',
              lineHeight: 1.2,
            }}
          >
            {product.title}
          </h1>

          {typeof product.rating === 'number' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ color: '#f5b400' }}>{'★'.repeat(Math.round(product.rating))}</span>
              <span
                className="cir-mono"
                style={{ fontSize: 12, color: 'var(--cir-color-fg-muted)' }}
              >
                {product.rating.toFixed(1)} · {product.stock ?? 0} in stock
              </span>
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
            <span
              className="cir-mono"
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--cir-color-fg)',
              }}
            >
              {formatPrice(product.price)}
            </span>
            {orig !== null ? (
              <>
                <span
                  className="cir-mono"
                  style={{
                    fontSize: 16,
                    textDecoration: 'line-through',
                    color: 'var(--cir-color-fg-muted)',
                  }}
                >
                  {formatPrice(orig)}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '3px 8px',
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

          {product.description ? (
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: 'var(--cir-color-fg-secondary)',
                marginBottom: 20,
              }}
            >
              {product.description}
            </p>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <label htmlFor="qty-input" style={{ fontSize: 13, color: 'var(--cir-color-fg-muted)' }}>
              Qty
            </label>
            <input
              id="qty-input"
              type="number"
              min={1}
              max={product.stock ?? 99}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              style={{
                width: 64,
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid var(--cir-color-border-default)',
                background: 'var(--cir-color-bg-surface)',
                color: 'var(--cir-color-fg)',
                borderRadius: 'var(--cir-radius-md)',
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={outOfStock}
              style={{
                appearance: 'none',
                border: 0,
                background: outOfStock ? 'var(--cir-color-bg-muted)' : 'var(--cir-color-primary)',
                color: outOfStock ? 'var(--cir-color-fg-muted)' : 'var(--cir-color-fg-on-primary)',
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 'var(--cir-radius-md)',
                cursor: outOfStock ? 'not-allowed' : 'pointer',
                flex: 1,
              }}
            >
              {outOfStock ? 'Sold out' : `Add ${qty > 1 ? String(qty) + ' ' : ''}to cart`}
            </button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--cir-color-fg-muted)' }}>
            Free returns within 30 days · {product.category ?? 'general'}
          </div>
        </div>
      </div>

      {undoState ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 70,
            background: 'var(--cir-color-fg)',
            color: 'var(--cir-color-bg)',
            padding: '10px 14px',
            borderRadius: 'var(--cir-radius-full)',
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: 'var(--cir-shadow-lg)',
          }}
        >
          <span>
            Added {undoState.qty}× <strong>{product.title}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              void dispatch('dummyjson.cart.remove', { product_id: product.id });
              setUndoState(null);
            }}
            style={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              color: 'var(--cir-color-primary)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
ProductDetail.displayName = 'ProductDetail';

function DetailSkeleton(): ReactNode {
  return (
    <div
      aria-busy="true"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
        gap: 32,
      }}
    >
      <div
        style={{
          height: 360,
          background: 'var(--cir-color-bg-muted)',
          borderRadius: 'var(--cir-radius-lg)',
        }}
      />
      <div>
        <div
          style={{
            height: 22,
            width: '70%',
            background: 'var(--cir-color-bg-muted)',
            borderRadius: 4,
            marginBottom: 12,
          }}
        />
        <div
          style={{
            height: 36,
            width: '40%',
            background: 'var(--cir-color-bg-muted)',
            borderRadius: 4,
            marginBottom: 16,
          }}
        />
        <div
          style={{
            height: 60,
            background: 'var(--cir-color-bg-muted)',
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
}
