# Changelog

All notable changes to `@atelier/evals` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/evals` ships:

- `defineEval` API + `atelier-evals` CLI bin (`run`, `--pattern`).
- Discovers and runs scenario-based evals against capabilities, skills,
  components, and manifests.
- Glob pattern + tag filtering; failure-only output with kleur-coloured
  reporting.
- Wired into the CIR `pnpm evals` script and the V-6.e nightly job.
- Built artifacts + bin runnable under bare Node + tsx loader.
