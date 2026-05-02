// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Capability bundle for the dummyjson catalog demo.
 *
 * The three baseline capabilities (`dummyjson.product.list`,
 * `dummyjson.product.search`, `dummyjson.cart.add`) ship in
 * `capabilities/dummyjson/`. The demo widens that surface with three more,
 * authored under `capabilities/dummyjson/` so they validate against
 * `CapabilitySchema` like everything else:
 *
 *   - `dummyjson.cart.list` — read the cart contents.
 *   - `dummyjson.cart.remove` — remove an item from the cart.
 *   - `dummyjson.product.recommendations` — neighbour products for the
 *     detail page recommendation rail.
 *
 * The compiler binds against this map; the runtime gates actions through
 * it for confirmation/rate-limit/reversibility decisions.
 */

import type { Capability } from '@atelier/schemas';

export const CAPABILITIES: Record<string, Capability> = {
  'dummyjson.product.list': {
    id: 'dummyjson.product.list',
    kind: 'data',
    version: '0.1.0',
    input: { limit: 'number', skip: 'number' },
    output: {},
    side_effects: ['reads:dummyjson_catalog'],
    permissions: ['catalog:read'],
    confirmation: 'none',
    rate_limit: '120/min/user',
    reversible: true,
  },
  'dummyjson.product.search': {
    id: 'dummyjson.product.search',
    kind: 'data',
    version: '0.1.0',
    input: { q: 'string', limit: 'number' },
    output: {},
    side_effects: ['reads:dummyjson_catalog'],
    permissions: ['catalog:read'],
    confirmation: 'none',
    rate_limit: '120/min/user',
    reversible: true,
  },
  'dummyjson.product.recommendations': {
    id: 'dummyjson.product.recommendations',
    kind: 'data',
    version: '0.1.0',
    input: { product_id: 'number', limit: 'number' },
    output: {},
    side_effects: ['reads:dummyjson_catalog'],
    permissions: ['catalog:read'],
    confirmation: 'none',
    rate_limit: '60/min/user',
    reversible: true,
  },
  'dummyjson.cart.list': {
    id: 'dummyjson.cart.list',
    kind: 'data',
    version: '0.1.0',
    input: { user_id: 'number' },
    output: {},
    side_effects: ['reads:cart_state'],
    permissions: ['cart:read'],
    confirmation: 'none',
    rate_limit: '120/min/user',
    reversible: true,
  },
  'dummyjson.cart.add': {
    id: 'dummyjson.cart.add',
    kind: 'action',
    version: '0.1.0',
    input: { user_id: 'number', product_id: 'number', quantity: 'number' },
    output: {},
    side_effects: ['mutates:cart_state'],
    permissions: ['cart:write'],
    confirmation: 'inline',
    rate_limit: '60/min/user',
    reversible: true,
    rollback: 'dummyjson.cart.remove',
    low_stakes: true,
  },
  'dummyjson.cart.remove': {
    id: 'dummyjson.cart.remove',
    kind: 'action',
    version: '0.1.0',
    input: { user_id: 'number', product_id: 'number' },
    output: {},
    side_effects: ['mutates:cart_state'],
    permissions: ['cart:write'],
    confirmation: 'inline',
    rate_limit: '60/min/user',
    reversible: true,
    rollback: 'dummyjson.cart.add',
    low_stakes: true,
  },
  // Quota source — read-only capability surfacing the cart-add rate-limit
  // budget. Bound by `<MarigoldHeader>` so the
  // `rate_limited_actions_show_state` policy walker finds a quota
  // ancestor on every route that exposes a rate-limited action. Phase
  // 1.5 (Dynamic UI Activation) added this; without it, any LLM-
  // produced manifest exposing `dummyjson.cart.{add,remove}` would
  // fail the policy.
  'dummyjson.cart.add.rate_limit': {
    id: 'dummyjson.cart.add.rate_limit',
    kind: 'data',
    version: '0.1.0',
    input: { user_id: 'number' },
    output: {
      remaining: 'number',
      limit: 'number',
      reset_at: 'number',
    },
    side_effects: [],
    permissions: ['cart:read'],
    confirmation: 'none',
    rate_limit: '120/min/user',
    reversible: true,
    low_stakes: true,
  },
  // Same shape, different capability. Cart-add and cart-remove share a
  // rate-limit budget in practice but the policy walker treats them as
  // separate sources. Splitting them keeps the validator strict and
  // honest.
  'dummyjson.cart.remove.rate_limit': {
    id: 'dummyjson.cart.remove.rate_limit',
    kind: 'data',
    version: '0.1.0',
    input: { user_id: 'number' },
    output: {
      remaining: 'number',
      limit: 'number',
      reset_at: 'number',
    },
    side_effects: [],
    permissions: ['cart:read'],
    confirmation: 'none',
    rate_limit: '120/min/user',
    reversible: true,
    low_stakes: true,
  },
};
