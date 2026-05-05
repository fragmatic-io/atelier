# Changelog

All notable changes to `@atelier/vault-server` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/vault-server` ships:

- `node:http`-based intent vault (no Express dependency); ed25519 JWTs
  and JSON-file storage by default; pluggable storage adapter.
- Mints scoped read tokens with deny-by-default scope filtering.
- Emits revocation triggers consumed via the runtime's `TriggerBus`.
- Marketplace endpoints (V-6 closures): publish, consume, review,
  curate. Default-on; opt-out via `ATELIER_MARKETPLACE=off`.
- Sign-at-publish for marketplace artifacts; signatures verified by
  `@atelier/vault-client`.
- Built artifacts; downstream consumers do not need `tsx`.
