# Changelog

All notable changes to `@atelier/eval-marketplace` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/eval-marketplace` ships:

- `runMarketplaceEval` — runs the top-N approved personas from the
  marketplace through a frozen reference compile + `ManifestSchema` +
  policy validation, surfaces an `EvalReport` per nightly run.
- Deterministic-compile baseline (no LLM dep) — V-6.e nightly gate.
- CSV + JSON report output for the cost dashboard.
- Built artifacts; downstream consumers do not need `tsx`.
