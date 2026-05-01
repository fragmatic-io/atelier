// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
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

import type { Capability } from '@cir/schemas';

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
};
