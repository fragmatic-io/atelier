// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * React context that carries the `@atelier/runtime` services into the tree.
 *
 * The provider (`<CirRuntime>`) sets this context once at app boot. Every
 * hook (`useCir`, `useManifest`, `useDispatcher`, `useTrigger`) reads from
 * here. Splitting the services bag from the data resolver context is
 * deliberate: hosts that want to override only the resolver shouldn't have
 * to rebuild the rest.
 *
 * `identity` is the `(user_id, app_id)` pair the provider serves. Multi-
 * tenant apps wrap subtrees with nested providers if they need to switch
 * identity mid-tree.
 */

import { createContext } from 'react';
import type {
  ActionDispatcher,
  AuditSink,
  ComponentRegistry,
  ManifestResolver,
  TriggerSubscription,
} from '@atelier/runtime';
import type { BrandKit, IntentProfile, LayoutNode } from '@atelier/schemas';

/**
 * Phase 2 #4 — Resolver fallback contract.
 *
 * Default state slot nodes the render walker substitutes when a data-bound
 * node's manifest does NOT declare the corresponding `data.empty_state` /
 * `data.loading_state` / `data.error_state`. Per `docs/ethos.md` principle
 * #9 (Resolver supplies fallbacks), manifests opt OUT (or override) — they
 * do not opt IN.
 *
 * Each slot is authored as a `LayoutNode` (the same shape manifests use) so
 * hosts can per-app customize the default copy / surface. The walker takes
 * the chosen node, runs it through the component registry, and renders it
 * carrying `data-cir-default-state="empty|loading|error"` so tests and
 * audit tooling can detect a default vs. an explicit override.
 */
export interface CirResolverDefaults {
  empty?: LayoutNode;
  loading?: LayoutNode;
  error?: LayoutNode;
}

export interface CirRuntimeServices {
  resolver: ManifestResolver;
  dispatcher: ActionDispatcher;
  registry: ComponentRegistry;
  bus: TriggerSubscription;
  audit?: AuditSink;
  /** Identity context — what user/app this provider serves. */
  identity: { user_id: string; app_id: string };
  /**
   * The active intent profile for this user. Optional — hosts that haven't
   * wired the vault / onboarding yet leave it unset. When present, the
   * `<RenderNode>` walker uses `intent.global_preferences` to default
   * personalisation props (e.g. `density`) on layout components whose
   * manifest entry omits them.
   *
   * Threaded as a service rather than its own context so a single
   * `<CirRuntime>` provider remains the only place to wire personalisation.
   */
  intent?: IntentProfile;
  /**
   * The active brand kit for this app. Optional — kits live at
   * `/.well-known/brand-kit.json` in production, but hosts thread a typed
   * reference here for the compiler / policy engine to read directly.
   * Track DS-A (Wave 11) wired this for `apps/demo`'s "Aurora" theme.
   */
  brandKit?: BrandKit;
  /**
   * Per-host overrides for the resolver fallback contract (Phase 2 #4).
   * When unset, the render walker uses `BASELINE_RESOLVER_DEFAULTS` —
   * `<EmptyState title="No items" .../>`, `<Skeleton variant="row" .../>`,
   * `<Alert severity="error" title="Failed to load" .../>`. Hosts shipping
   * a distinctive empty / loading / error language pass their own nodes
   * here so every data-bound component on the app inherits it.
   */
  resolverDefaults?: CirResolverDefaults;
}

/**
 * Baseline default state slot nodes the render walker substitutes when the
 * host did NOT provide `services.resolverDefaults`. Centralized so unit
 * tests can assert against the canonical defaults without depending on a
 * specific host wiring.
 *
 * The `body` / `description` copy is intentionally generic — apps that want
 * a distinctive voice (e.g. github's "Inbox zero" message) override per
 * route by declaring the slot inline on `data.empty_state`.
 */
export const BASELINE_RESOLVER_DEFAULTS: Required<CirResolverDefaults> = Object.freeze({
  empty: {
    component: 'EmptyState',
    props: { title: 'No items', description: 'Nothing to show yet.' },
    children: [],
  },
  loading: {
    component: 'Skeleton',
    props: { shape: 'table-row', count: 4 },
    children: [],
  },
  error: {
    component: 'Alert',
    props: {
      severity: 'error',
      title: 'Failed to load',
      // The body string is rendered as Alert children below the title.
    },
    children: [],
  },
});

/**
 * Internal context. Hooks call `useCir()` which throws when this is null —
 * surfaces "you forgot the provider" as a clear runtime error rather than a
 * mysterious `undefined`.
 */
export const CirRuntimeContext = createContext<CirRuntimeServices | null>(null);
