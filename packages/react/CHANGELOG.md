# Changelog

All notable changes to `@atelier/react` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/react` ships:

- `CirRuntime` provider + render walker that maps a `RenderPlan` to JSX.
- React 19-aware hooks: `useCir`, `useDispatcher`, `useResolver`,
  `useDataPulse`, `useShimmerOnChange`, `useTweenNumber`,
  `useOptimisticAction`, `useUndoableDispatch`, `useUndoToastEmitter`,
  `useSavedView`, `useScrollRestore`, `useViewState`, `useViewTransition`,
  `useReducedMotion`, `useTrigger`, `useSubscription`, `useMultiSelect`,
  `useTrail`, `useTransition`, `useSmartPaste`, `useVersionHistory`,
  `useAutosave`, `usePersistedState`.
- `./testing` subpath: `buildTestServices`, `renderWithCir` for downstream
  test setup.
- `./debug` subpath: `CompileBadge` + debug panel for manifest inspection.
- `ErrorBoundary` baseline.
- Peer-dep on React 19; built artifacts ship no React internals.
