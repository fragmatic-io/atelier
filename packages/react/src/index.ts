// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/react` — public surface of the React adapter for `@cir/runtime`.
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
 *  - Component implementations — those live in `@cir/components`.
 *
 * Test helpers (a render-with-provider wrapper) live under
 * `@cir/react/testing`. Import from that subpath in test code, never from
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

// -----------------------------------------------------------------------------
// Data resolver protocol
// -----------------------------------------------------------------------------
export {
  DataResolverContext,
  EmptyDataResolver,
  type DataBinding,
  type DataResolver,
} from './data/data-resolver.js';

// -----------------------------------------------------------------------------
// Debug UI (for dev observability)
// -----------------------------------------------------------------------------
export { DebugPanel, type DebugPanelProps } from './debug/debug-panel.js';
export { CompileBadge, type CompileBadgeProps } from './debug/compile-badge.js';
