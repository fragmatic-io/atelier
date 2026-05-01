// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * React context that carries the `@cir/runtime` services into the tree.
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
} from '@cir/runtime';
import type { AmbientPolicySatisfier } from '@cir/policies';
import type { BrandKit, IntentProfile } from '@cir/schemas';

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
   * Declarations that ambient runtime services satisfy named policy
   * obligations (Phase 2 #5 / `docs/ethos.md` principle #4).
   *
   * The `<UndoToast>` mounted at the app root and the `<RateLimitChip>`
   * rendered in the chrome are the canonical examples — they live in the
   * rendered DOM regardless of which manifest is mounted, so making each
   * route-level manifest also declare an in-tree anchor for them is
   * redundant. Hosts list the satisfiers here; the policy validator
   * consults the list before falling back to manifest-tree evidence.
   *
   * The satisfier list is **additive**: existing manifest-level evidence
   * (an in-tree `<UndoToast>`, a `*.rate_limit` data binding) still
   * satisfies the obligation. The new path simply gives hosts a way to
   * say "the chrome already covers this — stop demanding a hidden anchor
   * node in every manifest". Pre-built declarations live in
   * `@cir/policies` (`UNDO_TOAST_AMBIENT_SATISFIER`,
   * `RATE_LIMIT_CHIP_AMBIENT_SATISFIER`).
   */
  ambientPolicySatisfiers?: readonly AmbientPolicySatisfier[];
}

/**
 * Internal context. Hooks call `useCir()` which throws when this is null —
 * surfaces "you forgot the provider" as a clear runtime error rather than a
 * mysterious `undefined`.
 */
export const CirRuntimeContext = createContext<CirRuntimeServices | null>(null);
