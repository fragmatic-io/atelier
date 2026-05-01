// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `CartItemList` — manifest-bound cart view. The walker resolves
 * `data: { source: 'dummyjson.cart.list', filter: 'user_id = 1' }` and
 * hands the envelope here as `props.data`. The dummyjson `/carts/user/{id}`
 * endpoint returns `{ carts: [{ products: [...], total, ... }], total }`.
 *
 * Renders:
 *   - one row per cart item (image + title + qty + line total + remove btn)
 *   - subtotal / discounted total
 *   - "Checkout" CTA
 *   - empty-state (designed prose + back-to-browse CTA)
 *
 * Reversibility: removing a row spawns a 5-second undo toast; clicking
 * Undo restores the line. The toast is the only place the rollback action
 * is surfaced — no orphan ghost buttons in the page body.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDispatcher } from '@cir/react';
import type { Density } from '@cir/components';

interface CartProduct {
  id: number;
  title: string;
  price: number;
  quantity: number;
  total?: number;
  discountPercentage?: number;
  discountedPrice?: number;
  thumbnail?: string;
}

interface Cart {
  id?: number;
  products?: readonly CartProduct[];
  total?: number;
  discountedTotal?: number;
  totalProducts?: number;
  totalQuantity?: number;
}

interface CartListEnvelope {
  carts?: readonly Cart[];
  total?: number;
}

export interface CartItemListProps {
  data?: CartListEnvelope | Cart | null;
  loading?: boolean;
  error?: Error | null;
  density?: Density;
  ['dummyjson.cart.remove']?: (input: { product_id: number }) => unknown;
}

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function unwrapCart(data: CartListEnvelope | Cart | null | undefined): Cart | null {
  if (!data) return null;
  // `/carts/user/{id}` returns `{ carts: [...], total }` even when there's
  // exactly one cart per user. Pick the first.
  if ('carts' in data && Array.isArray(data.carts)) {
    return data.carts[0] ?? null;
  }
  return data as Cart;
}

interface UndoState {
  product: CartProduct;
  at: number;
}

export function CartItemList({
  data,
  loading,
  error,
  density: _density = 'comfortable',
  ...rest
}: CartItemListProps): ReactNode {
  const dispatch = useDispatcher();
  const onRemoveProp = (rest as Record<string, unknown>)['dummyjson.cart.remove'] as
    | ((input: { product_id: number }) => unknown)
    | undefined;

  const cart = unwrapCart(data);
  const serverProducts = cart?.products ?? [];

  // Locally tracked removed IDs so the optimistic UI takes effect even
  // though the dummyjson DELETE endpoint does not actually mutate state.
  const [removed, setRemoved] = useState<ReadonlySet<number>>(() => new Set());
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return (): void => {
      if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const visible = useMemo(
    () => serverProducts.filter((p) => !removed.has(p.id)),
    [serverProducts, removed],
  );

  const subtotal = useMemo(
    () => visible.reduce((sum, p) => sum + (p.total ?? p.price * p.quantity), 0),
    [visible],
  );
  const discountedTotal = useMemo(
    () =>
      visible.reduce((sum, p) => sum + (p.discountedPrice ?? p.total ?? p.price * p.quantity), 0),
    [visible],
  );
  const savings = Math.max(0, subtotal - discountedTotal);

  if (loading && serverProducts.length === 0) {
    return <SkeletonRows />;
  }

  if (error !== null && error !== undefined) {
    return (
      <div
        data-cir-part="error"
        role="alert"
        style={{
          padding: 16,
          borderRadius: 'var(--cir-radius-lg)',
          background: 'color-mix(in srgb, var(--cir-color-danger) 10%, transparent)',
          color: 'var(--cir-color-danger)',
        }}
      >
        Couldn’t load your cart — {error.message}
      </div>
    );
  }

  if (visible.length === 0) {
    return <CartEmptyState />;
  }

  const handleRemove = (product: CartProduct): void => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.add(product.id);
      return next;
    });
    setUndoState({ product, at: Date.now() });
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoState(null);
    }, 5000);
    const input = { product_id: product.id };
    const result = onRemoveProp ? onRemoveProp(input) : dispatch('dummyjson.cart.remove', input);
    Promise.resolve(result).catch(() => {
      // Roll back on dispatch failure.
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
      setUndoState(null);
    });
  };

  const undoRemove = (): void => {
    if (!undoState) return;
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(undoState.product.id);
      return next;
    });
    setUndoState(null);
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
  };

  return (
    <div data-cir-component="CartItemList">
      <ul
        data-cir-part="rows"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          background: 'var(--cir-color-bg-card)',
          border: '1px solid var(--cir-color-border-subtle)',
          borderRadius: 'var(--cir-radius-lg)',
          overflow: 'hidden',
        }}
      >
        {visible.map((p, idx) => {
          const lineTotal = p.total ?? p.price * p.quantity;
          return (
            <li
              key={p.id}
              data-cir-part="row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderTop: idx === 0 ? 0 : '1px solid var(--cir-color-border-subtle)',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  flexShrink: 0,
                  borderRadius: 'var(--cir-radius-md)',
                  background: 'var(--cir-color-bg-subtle)',
                  overflow: 'hidden',
                }}
              >
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt={p.title}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--cir-color-fg)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <a href={`/product/${String(p.id)}`} style={{ color: 'inherit' }}>
                    {p.title}
                  </a>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--cir-color-fg-muted)',
                    marginTop: 4,
                  }}
                >
                  Qty {p.quantity} · {formatPrice(p.price)} each
                </div>
              </div>
              <div
                className="cir-mono"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--cir-color-fg)',
                  minWidth: 80,
                  textAlign: 'right',
                }}
              >
                {formatPrice(lineTotal)}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(p)}
                aria-label={`Remove ${p.title}`}
                style={{
                  appearance: 'none',
                  border: '1px solid var(--cir-color-border-default)',
                  background: 'var(--cir-color-bg-surface)',
                  color: 'var(--cir-color-fg-muted)',
                  borderRadius: 'var(--cir-radius-md)',
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <div
        data-cir-part="totals"
        style={{
          marginTop: 16,
          padding: '14px 16px',
          background: 'var(--cir-color-bg-subtle)',
          borderRadius: 'var(--cir-radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <Row label="Subtotal" value={formatPrice(subtotal)} />
        {savings > 0 ? (
          <Row
            label="Savings"
            value={`−${formatPrice(savings)}`}
            valueColor="var(--cir-color-success)"
          />
        ) : null}
        <Row label="Total" value={formatPrice(discountedTotal)} emphasized />
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <a
          href="/browse"
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--cir-radius-md)',
            border: '1px solid var(--cir-color-border-default)',
            color: 'var(--cir-color-fg)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Continue shopping
        </a>
        <a
          href="/checkout"
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--cir-radius-md)',
            background: 'var(--cir-color-primary)',
            color: 'var(--cir-color-fg-on-primary)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Checkout
        </a>
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
            Removed <strong>{undoState.product.title}</strong>
          </span>
          <button
            type="button"
            onClick={undoRemove}
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
CartItemList.displayName = 'CartItemList';

function Row({
  label,
  value,
  valueColor,
  emphasized,
}: {
  label: string;
  value: string;
  valueColor?: string;
  emphasized?: boolean;
}): ReactNode {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span
        style={{
          fontSize: emphasized ? 14 : 13,
          fontWeight: emphasized ? 600 : 400,
          color: emphasized ? 'var(--cir-color-fg)' : 'var(--cir-color-fg-muted)',
        }}
      >
        {label}
      </span>
      <span
        className="cir-mono"
        style={{
          fontSize: emphasized ? 17 : 13,
          fontWeight: emphasized ? 700 : 500,
          color: valueColor ?? 'var(--cir-color-fg)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CartEmptyState(): ReactNode {
  return (
    <div
      data-cir-component="EmptyState"
      style={{
        textAlign: 'center',
        padding: '60px 20px',
        background: 'var(--cir-color-bg-subtle)',
        borderRadius: 'var(--cir-radius-lg)',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden="true">
        🛒
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--cir-color-fg)',
          marginBottom: 6,
        }}
      >
        Your cart is empty
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--cir-color-fg-muted)',
          marginBottom: 18,
        }}
      >
        Browse the catalog and tap “Add to cart” — items show up here with a 5s undo toast.
      </div>
      <a
        href="/browse"
        style={{
          display: 'inline-block',
          padding: '10px 18px',
          borderRadius: 'var(--cir-radius-md)',
          background: 'var(--cir-color-primary)',
          color: 'var(--cir-color-fg-on-primary)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Browse products
      </a>
    </div>
  );
}

function SkeletonRows(): ReactNode {
  return (
    <ul
      aria-busy="true"
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        background: 'var(--cir-color-bg-card)',
        border: '1px solid var(--cir-color-border-subtle)',
        borderRadius: 'var(--cir-radius-lg)',
        overflow: 'hidden',
      }}
    >
      {[1, 2, 3].map((k) => (
        <li
          key={k}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 16px',
            borderTop: k === 1 ? 0 : '1px solid var(--cir-color-border-subtle)',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              flexShrink: 0,
              borderRadius: 'var(--cir-radius-md)',
              background: 'var(--cir-color-bg-muted)',
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: '60%',
                height: 14,
                background: 'var(--cir-color-bg-muted)',
                borderRadius: 4,
                marginBottom: 8,
              }}
            />
            <div
              style={{
                width: '30%',
                height: 12,
                background: 'var(--cir-color-bg-muted)',
                borderRadius: 4,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
