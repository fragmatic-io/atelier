// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `ProductGrid` — manifest-bound product catalog. The walker resolves
 * `data: { source: 'dummyjson.product.list' }` and hands the envelope here
 * as `props.data`. The grid:
 *
 *   1. Reads the optional client-side filter state (search query, category
 *      chip, in-stock toggle) the manifest supplies via the `filterStore`.
 *      All three are local state on this component — the manifest can wire
 *      a `<Search>` / `<FilterBar>` sibling but those are read-only ornaments
 *      until we extend the renderer to share state. For the showcase we
 *      mount the controls inline so the demo *works*.
 *   2. Picks columns by `density`:
 *      - compact → 1 column (rich list rows)
 *      - comfortable → 3 columns
 *      - spacious → 2 columns
 *   3. Renders one `<ProductCard>` per surviving product. Optimistic
 *      add-to-cart flips the row's "Added" badge immediately and shows a
 *      5-second undo toast at the bottom (Wave 7a / Int-4). Undo retracts.
 *      The toast surface is the only place reversibility is shown — there
 *      are no "Restore last removed" / "Undo last add" ghost buttons in
 *      the page body.
 *   4. Falls back to a `<Skeleton>`-style placeholder block while loading
 *      and an `<EmptyState>`-style message when zero products survive
 *      filtering. Honours the manifest's `error_state` only by surfacing
 *      a string — the renderer already passes `error` through.
 *
 * The `Search` + `FilterBar` controls live inline so the demo works end-to-
 * end without a global filter store. A future iteration can lift the state
 * into a manifest-driven store and have the manifest's sibling controls
 * drive it.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDispatcher } from '@cir/react';
import type { Density } from '@cir/components';
import { ProductCard, type DummyJsonProduct } from './ProductCard.js';

interface DummyJsonProductsEnvelope {
  products?: readonly DummyJsonProduct[];
  total?: number;
  skip?: number;
  limit?: number;
}

export interface ProductGridProps {
  /** Resolved by `<RenderNode>` from `data: { source: 'dummyjson.product.list' }`. */
  data?: DummyJsonProductsEnvelope | readonly DummyJsonProduct[] | null;
  loading?: boolean;
  error?: Error | null;
  density?: Density;
  /** Optional category chips. When omitted the FilterBar is skipped. */
  categories?: readonly string[];
  /**
   * The dispatcher prop the renderer attaches when the manifest declares
   * `actions: ['dummyjson.cart.add']`. Receives `{ user_id, product_id, quantity }`.
   */
  ['dummyjson.cart.add']?: (input: { product_id: number; quantity: number }) => unknown;
}

const DEFAULT_CATEGORIES: readonly string[] = Object.freeze([
  'smartphones',
  'laptops',
  'fragrances',
  'skincare',
  'groceries',
]);

/** Read the products array out of either an envelope or a raw array. */
function unwrapProducts(
  data: DummyJsonProductsEnvelope | readonly DummyJsonProduct[] | null | undefined,
): readonly DummyJsonProduct[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as readonly DummyJsonProduct[];
  const env = data as DummyJsonProductsEnvelope;
  return env.products ?? [];
}

interface UndoToastState {
  product: DummyJsonProduct;
  at: number;
}

export function ProductGrid({
  data,
  loading,
  error,
  density = 'comfortable',
  categories = DEFAULT_CATEGORIES,
  ...rest
}: ProductGridProps): ReactNode {
  const dispatch = useDispatcher();
  const onAddProp = (rest as Record<string, unknown>)['dummyjson.cart.add'] as
    | ((input: { product_id: number; quantity: number }) => unknown)
    | undefined;

  const products = unwrapProducts(data);

  // Local filter state. Lives here so the demo works end-to-end without a
  // global store; future iterations can hoist this into the manifest.
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);

  // Optimistic-add state.
  const [addedIds, setAddedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timer on unmount.
  useEffect(() => {
    return (): void => {
      if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory !== null && p.category !== activeCategory) return false;
      if (inStockOnly && (p.stock ?? 0) === 0) return false;
      if (q.length > 0) {
        const hay = `${p.title} ${p.brand ?? ''} ${p.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, query, activeCategory, inStockOnly]);

  const columns = density === 'compact' ? 1 : density === 'spacious' ? 2 : 3;

  const handleAdd = (product: DummyJsonProduct): void => {
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.add(product.id);
      return next;
    });
    setUndoToast({ product, at: Date.now() });
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
    }, 5000);

    // Fire the action through the manifest-bound dispatcher when available;
    // fall back to the global dispatch hook otherwise.
    const input = { product_id: product.id, quantity: 1 };
    const result = onAddProp ? onAddProp(input) : dispatch('dummyjson.cart.add', input);
    Promise.resolve(result).catch(() => {
      // Roll back on failure.
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
      setUndoToast(null);
    });
  };

  const undo = (): void => {
    if (!undoToast) return;
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.delete(undoToast.product.id);
      return next;
    });
    void dispatch('dummyjson.cart.remove', { product_id: undoToast.product.id });
    setUndoToast(null);
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
  };

  return (
    <div data-cir-component="ProductGrid" data-cir-density={density}>
      <div
        data-cir-part="controls"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid var(--cir-color-border-subtle)',
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products"
          aria-label="Search products"
          style={{
            flex: '1 1 240px',
            minWidth: 200,
            padding: '8px 12px',
            border: '1px solid var(--cir-color-border-default)',
            background: 'var(--cir-color-bg-surface)',
            color: 'var(--cir-color-fg)',
            borderRadius: 'var(--cir-radius-md)',
            fontSize: 13,
          }}
        />
        <div data-cir-part="category-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            data-active={activeCategory === null}
            style={chipStyle(activeCategory === null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(activeCategory === c ? null : c)}
              data-active={activeCategory === c}
              style={chipStyle(activeCategory === c)}
            >
              {c.replace('-', ' ')}
            </button>
          ))}
        </div>
        <label
          data-cir-part="in-stock-toggle"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--cir-color-fg-muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
          />
          In stock
        </label>
        <span
          data-cir-part="count"
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: 'var(--cir-color-fg-muted)',
          }}
          className="cir-mono"
        >
          {filtered.length} of {products.length}
        </span>
      </div>

      {loading && products.length === 0 ? (
        <SkeletonGrid columns={columns} />
      ) : error !== null && error !== undefined ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <div
          data-cir-part="grid"
          style={{
            display: 'grid',
            gridTemplateColumns:
              columns === 1 ? '1fr' : `repeat(${String(columns)}, minmax(0, 1fr))`,
            gap: density === 'spacious' ? 20 : density === 'compact' ? 8 : 16,
          }}
        >
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              density={density}
              added={addedIds.has(product.id)}
              onAdd={handleAdd}
              href={`/product/${String(product.id)}`}
            />
          ))}
        </div>
      )}

      {undoToast ? <UndoToast product={undoToast.product} onUndo={undo} /> : null}
    </div>
  );
}
ProductGrid.displayName = 'ProductGrid';

function chipStyle(active: boolean): React.CSSProperties {
  return {
    appearance: 'none',
    border: '1px solid',
    borderColor: active ? 'var(--cir-color-primary)' : 'var(--cir-color-border-default)',
    background: active ? 'var(--cir-color-primary)' : 'var(--cir-color-bg-surface)',
    color: active ? 'var(--cir-color-fg-on-primary)' : 'var(--cir-color-fg)',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    padding: '5px 10px',
    borderRadius: 'var(--cir-radius-full)',
    cursor: 'pointer',
    textTransform: 'capitalize',
    transition: 'all 140ms var(--cir-ease-out)',
  };
}

function SkeletonGrid({ columns }: { columns: number }): ReactNode {
  return (
    <div
      data-cir-part="skeleton"
      aria-busy="true"
      style={{
        display: 'grid',
        gridTemplateColumns: columns === 1 ? '1fr' : `repeat(${String(columns)}, minmax(0, 1fr))`,
        gap: 16,
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--cir-color-bg-muted)',
            borderRadius: 'var(--cir-radius-lg)',
            height: 240,
            animation: 'cir-skeleton-shimmer 1.4s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`@keyframes cir-skeleton-shimmer { 0%, 100% { opacity: 0.7 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}

function EmptyState({ query }: { query: string }): ReactNode {
  return (
    <div
      data-cir-part="empty"
      style={{
        textAlign: 'center',
        padding: '40px 20px',
        background: 'var(--cir-color-bg-subtle)',
        borderRadius: 'var(--cir-radius-lg)',
        color: 'var(--cir-color-fg-muted)',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--cir-color-fg)' }}>
        No products match
      </div>
      <div style={{ fontSize: 13 }}>
        {query.length > 0
          ? `Nothing matched "${query}". Try clearing the search or a different category.`
          : 'Adjust the filters to see more results.'}
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: Error }): ReactNode {
  return (
    <div
      data-cir-part="error"
      role="alert"
      style={{
        padding: 16,
        borderRadius: 'var(--cir-radius-lg)',
        background: 'color-mix(in srgb, var(--cir-color-danger) 10%, transparent)',
        color: 'var(--cir-color-danger)',
        border: '1px solid var(--cir-color-danger)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Couldn’t reach DummyJSON</div>
      <div style={{ fontSize: 12, opacity: 0.9 }}>{error.message}</div>
    </div>
  );
}

function UndoToast({
  product,
  onUndo,
}: {
  product: DummyJsonProduct;
  onUndo: () => void;
}): ReactNode {
  return (
    <div
      data-cir-component="UndoToast"
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
        boxShadow: 'var(--cir-shadow-lg)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>
        Added <strong>{product.title}</strong> to cart
      </span>
      <button
        type="button"
        onClick={onUndo}
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
  );
}
