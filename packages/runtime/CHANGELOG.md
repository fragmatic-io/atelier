# Changelog

All notable changes to `@atelier/runtime` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/runtime` ships:

- Framework-agnostic core: `ManifestFetcher`, `ManifestResolver` (with
  resolver-fallback contract for empty / loading / error states),
  `ActionDispatcher` (Zod-validated input, undo middleware, rate limiter),
  `TriggerBus` with pluggable `TriggerTransport` (S-4: distributed
  fan-out via SSE), `ComponentRegistry`, render-plan derivation.
- IndexedDB-backed manifest cache with an LRU eviction policy.
- `MapActionRegistry` baseline + composition helpers.
- `./testing` subpath for fixture builders downstream tests can use.
- Built artifacts (`dist/`) — no `tsx` required for downstream consumers.
