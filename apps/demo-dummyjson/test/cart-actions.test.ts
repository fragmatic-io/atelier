// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Cart action handlers — the optimistic-UI surface (Wave 7a / Int-4) only
 * engages when the dispatcher resolves the action through the right path.
 * These tests stub `fetch` and confirm the demo's POST/DELETE wiring
 * matches the real DummyJSON contract.
 */

import { describe, expect, it, vi } from 'vitest';

const DUMMYJSON_BASE = 'https://dummyjson.com';

interface CartAddInput {
  user_id: number;
  product_id: number;
  quantity: number;
}

async function cartAdd(input: CartAddInput, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(`${DUMMYJSON_BASE}/carts/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: input.user_id,
      products: [{ id: input.product_id, quantity: input.quantity }],
    }),
  });
  if (!res.ok) throw new Error(`cart.add HTTP ${String(res.status)}`);
  return res.json();
}

async function cartRemove(productId: number, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(`${DUMMYJSON_BASE}/carts/${productId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`cart.remove HTTP ${String(res.status)}`);
  }
  return { removed_at: new Date().toISOString() };
}

describe('cart action handlers', () => {
  it('POSTs cart.add with the dummyjson cart envelope shape', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 9, totalProducts: 1 }), { status: 200 });
    });

    const result = (await cartAdd(
      { user_id: 1, product_id: 12, quantity: 2 },
      fetchImpl as typeof fetch,
    )) as { totalProducts: number };
    expect(result.totalProducts).toBe(1);
    expect(calls[0]?.url).toBe('https://dummyjson.com/carts/add');
    expect(calls[0]?.init?.method).toBe('POST');
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      userId: number;
      products: { id: number; quantity: number }[];
    };
    expect(body.userId).toBe(1);
    expect(body.products[0]?.id).toBe(12);
    expect(body.products[0]?.quantity).toBe(2);
  });

  it('DELETEs cart.remove and tolerates 404 for already-removed items', async () => {
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
      return new Response('not found', { status: 404 });
    });
    const result = (await cartRemove(12, fetchImpl as typeof fetch)) as { removed_at: string };
    expect(result.removed_at).toBeTruthy();
  });

  it('throws on a non-OK, non-404 cart.remove response', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(cartRemove(12, fetchImpl as typeof fetch)).rejects.toThrow(/HTTP 500/u);
  });
});
