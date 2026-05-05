# Changelog

All notable changes to `@atelier/recipe-resolver` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/recipe-resolver` ships:

- `LocalRecipeStore` — file-system backed recipe registry consumed by
  the C-5 `findRecipe` compiler tool.
- `SubstringRecipeResolver` — substring-scoring baseline.
- Embedding-backed resolver scaffolding (heavy embedding tests gated by
  `ATELIER_EMBEDDING_TESTS`).
- Default-on recipe RAG in `apps/demo` (opt-out via `ATELIER_RECIPE_RAG=off`).
- Built artifacts; downstream consumers do not need `tsx`.
