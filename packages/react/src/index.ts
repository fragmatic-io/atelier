// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/react` — public surface of the React adapter for `@atelier/runtime`.
 *
 * Phase 4b. Provides:
 *  - `<CirRuntime>` provider that puts runtime services on a React context.
 *  - Hooks: `useCir`, `useManifest`, `useDispatcher`, `useTrigger`,
 *    `useReactConfirmation`.
 *  - `<CirRoute>` top-level route renderer that maps a `RenderPlan` to JSX.
 *  - `<CirErrorBoundary>` for catching render errors.
 *  - `DataResolver` protocol + `EmptyDataResolver` sentinel.
 *
 * NOT exported here:
 *  - The internal `RenderNode` walker (treated as implementation detail).
 *  - Component implementations — those live in `@atelier/components`.
 *
 * Test helpers (a render-with-provider wrapper) live under
 * `@atelier/react/testing`. Import from that subpath in test code, never from
 * the main entry, so production bundles stay lean.
 */

// -----------------------------------------------------------------------------
// Provider + context
// -----------------------------------------------------------------------------
export { CirRuntime, type CirRuntimeProps } from './context/runtime-provider.js';
export {
  BASELINE_RESOLVER_DEFAULTS,
  type CirResolverDefaults,
  type CirRuntimeServices,
} from './context/runtime-context.js';

// -----------------------------------------------------------------------------
// Route + error boundary
// -----------------------------------------------------------------------------
export { CirRoute, type CirRouteProps } from './render/route.js';
export { CirErrorBoundary, type CirErrorBoundaryProps } from './error-boundary.js';

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------
export { useCir } from './hooks/use-cir.js';
export {
  useManifest,
  type UseManifestResult,
  type UseManifestOptions,
} from './hooks/use-resolver.js';
export { useDispatcher, type DispatchFn } from './hooks/use-dispatcher.js';
export { useTrigger, type TriggerEventType } from './hooks/use-trigger.js';
export {
  useOptimisticAction,
  type UseOptimisticActionOptions,
  type UseOptimisticActionResult,
} from './hooks/use-optimistic-action.js';
export { useReactConfirmation, type UseReactConfirmation } from './confirm/use-confirmation.js';
export { useMultiSelect, type UseMultiSelectResult } from './hooks/use-multi-select.js';
export {
  useUndoableDispatch,
  type UseUndoableDispatchResult,
  type UndoToastState,
} from './hooks/use-undoable-dispatch.js';
export {
  useUndoToastEmitter,
  createUndoToastEmitter,
  type UseUndoToastEmitter,
} from './hooks/use-undo-toast-emitter.js';
// Wave 7 / P-7 — motion hooks. Pair with `@atelier/runtime`'s motion module.
export { useReducedMotion } from './hooks/use-reduced-motion.js';
export { useViewTransition } from './hooks/use-view-transition.js';
export {
  useTransition,
  type UseTransitionOptions,
  type UseTransitionResult,
} from './hooks/use-transition.js';

// Wave 11 / Int-1 — data-update animation hooks. Pair with the
// row-appear / count-pulse keyframes scaffolded into the host's
// `globals.css` (see Int-1 CSS in `apps/demo/app/globals.css`).
export { useDataPulse } from './hooks/use-data-pulse.js';
export { useShimmerOnChange } from './hooks/use-shimmer-on-change.js';
export { useTweenNumber } from './hooks/use-tween-number.js';

// Wave 11 / Nav-4 — drilldown breadcrumb trail with optional URL sync.
// Pair with `<Breadcrumb trail={…} onNavigate={…}>` from `@atelier/components`.
export {
  useTrail,
  type UseTrailOptions,
  type UseTrailResult,
  type TrailSegment,
} from './hooks/use-trail.js';

// Wave 11 / Nav-2 — generic persisted-state hook (session / local / vault).
// Powers `<Sidebar storageKey="…">` collapse + tree memory and is the
// reusable primitive Int-11's view-state middleware composes on top of.
export {
  usePersistedState,
  PersistedVaultContext,
  type PersistedScope,
  type PersistedSetter,
  type PersistedStateOptions,
  type PersistedVaultClient,
} from './hooks/use-persisted-state.js';

// Wave 11 / Int-15 — smart paste with link unfurl. `useSmartPaste({ embedRegistry,
// onPaste, unfurlTimeoutMs? })` scans pasted text for the first URL, hands
// it to the host's Cnt-4 `EmbedRegistry`, and surfaces the resolved display
// payload (or falls back to raw text on miss / timeout). Pairs with
// `<RichText pasteSmart={{ embedRegistry }}>` from `@atelier/components`.
// `EmbedRegistry` / `EmbedDisplay` types are structurally mirrored here so
// the React adapter stays free of a runtime dep on `@atelier/components`.
export {
  useSmartPaste,
  detectFirstUrl,
  type SmartPasteOptions,
  type UseSmartPasteResult,
  type PasteEvent,
  type EmbedDisplay as SmartPasteEmbedDisplay,
  type EmbedRegistry as SmartPasteEmbedRegistry,
} from './hooks/use-smart-paste.js';

// Wave 11 / Int-11 — preserved scroll + view state across nav. Per-route
// `useViewState` (selection / filter / sort) + `useScrollRestore`
// (scrollTop on the scroll container). Both compose on top of Nav-2's
// `usePersistedState` and target `${routeKey}.view` / `${routeKey}.scroll`
// so a single `routeKey` covers both shapes without collision.
export {
  useViewState,
  type UseViewStateOptions,
  type ViewStateScope,
  type ViewStateSetter,
} from './hooks/use-view-state.js';
export { useScrollRestore, type UseScrollRestoreOptions } from './hooks/use-scroll-restore.js';

// Wave 11 / Cnt-10 — saved views
export { useSavedView } from './hooks/use-saved-view.js';
export type {
  UseSavedViewOptions,
  ViewDefinition as SavedViewDefinition,
} from './hooks/use-saved-view.js';

// Wave 11 / Cnt-11 — form auto-save (Notion / Coda style). Debounces
// `save()` calls, exposes a status state machine + lastSavedAt, and
// surfaces a `flush()` escape hatch for beforeunload / route-change
// boundaries. Pairs with `useVersionHistory` — call `commit()` from
// `onSaved` to keep history aligned with persisted snapshots.
export {
  useAutosave,
  type AutosaveStatus,
  type UseAutosaveOptions,
  type UseAutosaveResult,
} from './hooks/use-autosave.js';

// Wave 11 / Cnt-11 — per-doc version history. Snapshots on `commit()`,
// persists via Nav-2's `usePersistedState`, FIFO-evicts past
// `maxVersions`. Restoration is host-driven — `restore(id)` returns the
// snapshotted value and the host wires it back into its source-of-truth.
export {
  useVersionHistory,
  type VersionEntry,
  type UseVersionHistoryOptions,
  type UseVersionHistoryResult,
} from './hooks/use-version-history.js';

// -----------------------------------------------------------------------------
// Data resolver protocol
// -----------------------------------------------------------------------------
export {
  DataResolverContext,
  EmptyDataResolver,
  type DataBinding,
  type DataResolver,
} from './data/data-resolver.js';

// Wave 10 / S-3 — streaming subscriptions on `DataResolver`. The hook
// owns the iterator's lifecycle (open on mount, `return()` on unmount /
// binding change) and surfaces `data` / `loading` / `error` /
// `reconnect()`. Pair with `SseSubscriptionResolver` /
// `InMemorySubscriptionResolver` from `@atelier/data-resolvers`. Gates
// Coll-1..5 (multiplayer presence / cursors / comments).
export {
  useSubscription,
  type UseSubscriptionResult,
  type UseSubscriptionOptions,
} from './hooks/use-subscription.js';

// -----------------------------------------------------------------------------
// Debug UI (for dev observability)
// -----------------------------------------------------------------------------
export { DebugPanel, type DebugPanelProps } from './debug/debug-panel.js';
export { CompileBadge, type CompileBadgeProps } from './debug/compile-badge.js';
