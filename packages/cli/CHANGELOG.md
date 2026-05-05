# Changelog

All notable changes to `@atelier/cli` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Workspace lockstep release (Sprint 1.4). Bumped from `0.1.0` to `0.5.0`
to match the workspace baseline; no functional changes from `0.1.0`.

## 0.1.0 — earlier release

Initial public release of the `atelier` developer CLI:

- `atelier init` — scaffold a new project (Next.js host).
- `atelier dev` — runs the demo dev server with hot reload.
- `atelier add` — wire a capability / component / skill into a host.
- `atelier validate` — run the validate gate against a host.
- `atelier vault` — vault subcommands (mint, revoke, publish, consume,
  review).
- `atelier marketplace publish | review` — marketplace flow.
- `atelier lint skill <path>` — strict YAML frontmatter linter.
- Built artifacts + bin runnable under bare Node.
