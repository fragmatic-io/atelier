# Changelog

All notable changes to `@atelier/data-resolvers` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/data-resolvers` ships:

- `DataResolver` adapters: `RestDataResolver`, `OpenApiDataResolver`,
  `GraphqlDataResolver`, `MockDataResolver`, `CompositeDataResolver`.
- SWR-style cache wrapper (`CachedDataResolver`) with revalidation +
  stale-while-revalidate semantics.
- Hooks into the `DataResolver` protocol consumed by `@atelier/react`'s
  `useResolver` so manifest data bindings resolve to real data without
  a hand-rolled fetch layer.
- Built artifacts; downstream consumers do not need `tsx`.
