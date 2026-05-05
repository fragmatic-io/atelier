# Changelog

All notable changes to `@atelier/compiler` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/compiler` ships:

- `ToolUsingCompiler` (default-on, C-2 + S-1 closed): Gemini-backed
  manifest compile with capability scoping, recipe RAG, validation
  feedback retry, and budget metering.
- `MemoryManifestStore` + `ServerManifestResolver` backends.
- Pluggable `SemanticSearch` seam (consumed by `@atelier/capability-resolver`
  and `@atelier/recipe-resolver`).
- `BudgetMeter` with per-host call/token thresholds (`ATELIER_COMPILE_BUDGET_*`).
- Generic fallback compiler for offline / non-LLM hosts.
- Redis cache adapter for compile-result memoization.
- Built artifacts; downstream consumers do not need `tsx`.
