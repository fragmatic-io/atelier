// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

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

export interface CirRuntimeServices {
  resolver: ManifestResolver;
  dispatcher: ActionDispatcher;
  registry: ComponentRegistry;
  bus: TriggerSubscription;
  audit?: AuditSink;
  /** Identity context — what user/app this provider serves. */
  identity: { user_id: string; app_id: string };
}

/**
 * Internal context. Hooks call `useCir()` which throws when this is null —
 * surfaces "you forgot the provider" as a clear runtime error rather than a
 * mysterious `undefined`.
 */
export const CirRuntimeContext = createContext<CirRuntimeServices | null>(null);
