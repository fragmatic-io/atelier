# Changelog

All notable changes to `@atelier/vault-client` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/vault-client` ships:

- Typed wire client for `@atelier/vault-server` — read / mint / revoke
  scoped tokens, marketplace publish + consume, marketplace review flow.
- JWKS-cached ed25519 signature verification.
- Pluggable token storage (in-memory, localStorage, custom adapters).
- Typed errors (`VaultProtocolError`, `VaultNetworkError`,
  `VaultAuthError`, `VaultNotFoundError`).
- Default-on marketplace endpoints (V-6.a/b/f closures); opt-out via
  `ATELIER_MARKETPLACE=off` on the server.
- Built artifacts; downstream consumers do not need `tsx`.
