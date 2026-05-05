# Changelog

All notable changes to `@atelier/components` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/components` ships:

- 83-component baseline catalog (Wave 11 + Wave M closures): primitives,
  composites, content surfaces, navigation, feedback, AI surfaces.
- `COMPONENT_BINDINGS` map + `ALL_COMPONENTS` registry consumable by the
  React render walker.
- `./registry`, `./composition-rules`, `./density-resolver`, `./_variants`
  subpath exports for ahead-of-time component introspection.
- Density-aware variant system (`density: comfortable | cozy | compact`).
- Radix UI-backed interaction primitives (Dialog, Dropdown, Select, Tabs,
  Tooltip) wired to the CIR action dispatcher.
- React-Markdown with `remark-gfm` + `rehype-sanitize` for safe rich text.
- Lucide icons + optional Shiki for code-block highlighting (peer dep).
- Storybook visual gate (CI-enforced; see `pnpm components:storybook:visual`).
