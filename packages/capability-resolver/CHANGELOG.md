# Changelog

All notable changes to `@atelier/capability-resolver` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/capability-resolver` ships:

- `SubstringCapabilityResolver` — fast tokenized scoring baseline for
  the `SemanticSearch` seam in `@atelier/compiler` (`ToolUsingCompiler`).
- Two-stage resolver shape (tiny-model rerank) ready for an embedding
  back-end (S-1 / C-3 closures).
- Default-on capability scoping in `apps/demo` (opt-out via
  `ATELIER_CAPABILITY_RESOLVER=off`).
- Built artifacts; downstream consumers do not need `tsx`.
