# Changelog

All notable changes to `@atelier/keyboard` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/keyboard` ships:

- `InMemoryKeyboardRegistry` — hotkey-aware action vocabulary that powers
  Cmd+K, Cmd+P, and chord shortcuts.
- Pure logic, no React imports (consumed by `@atelier/components` for
  the command palette).
- Chord-shortcut data model (Int-7 in flight; foundation in place).
- Built artifacts; downstream consumers do not need `tsx`.
