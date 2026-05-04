// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Frozen reference capability set the V-6.e gate compiles against.
 *
 * The capabilities here are deliberately a SUPERSET of what the apps/demo
 * recipes reference today (dummyjson-shopper + github-reviewer). New
 * personas published to the marketplace get evaluated against this exact
 * set — if they reference a capability outside it, the gate compiles them
 * against an empty registry and the policy validator surfaces the missing
 * binding as a violation. That's the intended behaviour: a frozen
 * reference set is what makes the gate a CONTRACT signal rather than a
 * moving target.
 *
 * Why mirror `apps/demo` instead of importing from it: the eval package
 * intentionally has no workspace dep on apps/demo (apps depend on
 * packages, not the other way around). The set below is hand-curated to
 * stay parallel — when a new shipped recipe lands in apps/demo, this
 * file gets updated to match. The hash in `EvalReport.reference_versions`
 * is what makes drift visible (a regression report from before the
 * update has a different `capabilities_hash` than one taken after).
 */

import type { Capability } from '@atelier/schemas';

/**
 * Minimal-but-complete reference capability set.
 *
 * Each entry here mirrors the demo's `fake-capabilities.ts` shape; the
 * canonical-JSON encoding of the whole record produces
 * `EvalReport.reference_versions.capabilities_hash`.
 */
export const REFERENCE_CAPABILITIES: Record<string, Capability> = {
  // ---- DummyJSON (recipes/dummyjson-shopper.json) -----------------------
  'dummyjson.product.list': {
    id: 'dummyjson.product.list',
    kind: 'data',
    version: '0.1.0',
    input: {},
    output: { id: 'string', title: 'string', price: 'number' },
    side_effects: [],
    permissions: ['catalog:read'],
    confirmation: 'none',
    reversible: false,
  },
  'dummyjson.product.search': {
    id: 'dummyjson.product.search',
    kind: 'data',
    version: '0.1.0',
    input: { q: 'string' },
    output: { id: 'string', title: 'string' },
    side_effects: [],
    permissions: ['catalog:read'],
    confirmation: 'none',
    reversible: false,
  },
  'dummyjson.product.recommendations': {
    id: 'dummyjson.product.recommendations',
    kind: 'data',
    version: '0.1.0',
    input: { product_id: 'string' },
    output: { id: 'string', title: 'string' },
    side_effects: [],
    permissions: ['catalog:read'],
    confirmation: 'none',
    reversible: false,
  },
  'dummyjson.cart.list': {
    id: 'dummyjson.cart.list',
    kind: 'data',
    version: '0.1.0',
    input: { user_id: 'string' },
    output: { id: 'string', products: 'array' },
    side_effects: [],
    permissions: ['cart:read'],
    confirmation: 'none',
    reversible: false,
  },
  'dummyjson.cart.add': {
    id: 'dummyjson.cart.add',
    kind: 'action',
    version: '0.1.0',
    input: { product_id: 'string', quantity: 'number' },
    output: { id: 'string' },
    side_effects: ['mutates:cart'],
    permissions: ['cart:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'dummyjson.cart.remove',
  },
  'dummyjson.cart.remove': {
    id: 'dummyjson.cart.remove',
    kind: 'action',
    version: '0.1.0',
    input: { product_id: 'string' },
    output: {},
    side_effects: ['delete', 'mutates:cart'],
    permissions: ['cart:write'],
    confirmation: 'modal',
    reversible: true,
    rollback: 'dummyjson.cart.add',
  },

  // ---- Mail / threads (mirrors apps/demo's GitHub reviewer recipe) ------
  'thread.list': {
    id: 'thread.list',
    kind: 'data',
    version: '1.0.0',
    input: { filter: 'string' },
    output: { id: 'string', subject: 'string' },
    side_effects: [],
    permissions: ['thread:read'],
    confirmation: 'none',
    reversible: false,
  },
  'thread.archive': {
    id: 'thread.archive',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: { archived_at: 'string' },
    side_effects: ['archive', 'mutates:thread_state'],
    permissions: ['thread:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'thread.unarchive',
  },
  'thread.unarchive': {
    id: 'thread.unarchive',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: {},
    side_effects: ['mutates:thread_state'],
    permissions: ['thread:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'thread.archive',
  },
  'task.list': {
    id: 'task.list',
    kind: 'data',
    version: '1.0.0',
    input: {},
    output: { id: 'string', title: 'string' },
    side_effects: [],
    permissions: ['task:read'],
    confirmation: 'none',
    reversible: false,
  },
  'task.complete': {
    id: 'task.complete',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string' },
    output: {},
    side_effects: ['mutates:tasks'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.uncomplete',
  },
  'task.uncomplete': {
    id: 'task.uncomplete',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string' },
    output: {},
    side_effects: ['mutates:tasks'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.complete',
  },
};
