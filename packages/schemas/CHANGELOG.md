# Changelog

All notable changes to `@atelier/schemas` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows the [Atelier release policy](../../docs/release-policy.md)
(lockstep SemVer across all `@atelier/*` packages).

## 0.5.0 — 2026-05-04

Initial public release. Workspace migrated to lockstep SemVer (Sprint 1.4)
and every `@atelier/*` package is now publishable to npm.

The `0.5.0` baseline of `@atelier/schemas` ships:

- Zod schemas + generated JSON Schemas for the Capability · Intent · Render
  artifact graph: `CapabilitySchema`, `SkillSchema`, `ComponentDefinitionSchema`,
  `ComponentRegistrySchema`, `CompositionRuleSchema`, `IntentProfileSchema`,
  `ConversationOverlaySchema`, `TriggerSchema`, `ManifestSchema`, plus the
  policy descriptor + audit event row.
- Discriminated trigger taxonomy + canonical encoder for marketplace
  signing.
- `atelier-schemas` CLI bin: `dump` writes generated JSON Schemas under
  `.well-known/schemas`, `validate-data` validates a fixture set.
- AJV strict-mode gate (CI-enforced) confirms every JSON Schema is
  consumable by an external validator without warnings.
- Ships built artifacts (`dist/index.js` + `dist/index.d.ts` + sourcemaps)
  — no `tsx` / `ts-node` required for downstream consumers.
