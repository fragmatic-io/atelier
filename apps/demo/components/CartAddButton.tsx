// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * CartAddButton — minimal additive demo for Wave 7a / Int-4 (auto-optimistic
 * UI). The button wires `dummyjson.cart.add` through `useOptimisticAction`
 * and lets the runtime decide whether to apply the optimistic mutation
 * by reading the capability's `low_stakes` flag.
 *
 * Shipped as an optional widget — NOT wired into a manifest route. Hosts
 * that want a working cart screen can drop this anywhere in the tree under
 * `<CirRuntime>`.
 *
 * The capability is hand-authored at `capabilities/dummyjson/cart.add.json`
 * (`reversible: true`, `low_stakes: true`); the autodetect rule in
 * `useOptimisticAction` engages the optimistic path automatically.
 */

import { useState } from 'react';
import type { Capability } from '@cir/schemas';
import type { ActionResult } from '@cir/runtime';
import { useDispatcher, useOptimisticAction } from '@cir/react';

export interface CartAddButtonProps {
  /** The cart-add capability (passed in so the autodetect can fire). */
  capability: Capability;
  product_id: number;
  user_id: number;
  /** Initial cart count for the local optimistic counter. */
  initialCount?: number;
}

interface CartAddInput {
  user_id: number;
  product_id: number;
  quantity: number;
}

export function CartAddButton({
  capability,
  product_id,
  user_id,
  initialCount = 0,
}: CartAddButtonProps): React.JSX.Element {
  const dispatch = useDispatcher();
  const [count, setCount] = useState(initialCount);

  const { invoke, busy, toast } = useOptimisticAction<CartAddInput>({
    action: (input): Promise<ActionResult> => dispatch(capability.id, input),
    capability,
    // onApply: snap the local cart count up immediately. The runtime fires
    // this only when the capability is reversible + low_stakes.
    applyOptimistic: (input) => {
      setCount((n) => n + input.quantity);
    },
    // rollback: undo the local mutation if the network call fails. The toast
    // is rendered by the hook itself.
    rollback: (input) => {
      setCount((n) => n - input.quantity);
    },
  });

  return (
    <div data-cir-component="CartAddButton" className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => invoke({ user_id, product_id, quantity: 1 })}
        className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
      >
        Add to cart{count > 0 ? ` (${String(count)})` : ''}
      </button>
      {toast && (
        <span
          role="status"
          className={`text-xs px-2 py-1 rounded ${
            toast.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          {toast.message}
        </span>
      )}
    </div>
  );
}
