# Changelog

All notable changes to `@atelier/policies` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/policies` ships:

- Pure-function manifest validators run by the compiler against generated
  manifests (Phase 2 #4 resolver fallback contract + Phase 2 #5 ambient
  policy satisfaction).
- Canonical `ManifestComponentContract` enforcement.
- `BehavioralPatternDetector` interface + `NoopBehavioralDetector` stub
  for runtime pattern detection.
- `validateManifest` entry export consumed by `@atelier/compiler` and
  `@atelier/runtime`.
- Built artifacts; downstream consumers do not need `tsx`.
