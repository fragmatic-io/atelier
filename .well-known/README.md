# .well-known/

**Public discovery + schema artifacts.** The discovery document `cir.json` advertises a CIR-compliant app's capability registry, skill library, and component catalog so any compatible compiler, agent, or runtime can find them. The `schemas/` subdirectory holds the generated JSON Schemas for every CIR artifact type — this is the public, versioned contract third parties consume.

## Files

- `cir.json` — the discovery document. Served at `https://{app-host}/.well-known/cir.json` in production. It enumerates every capability, skill, policy, and recipe this repo exposes, with relative URLs and versions, so a third-party compiler/agent can crawl the surface without reading code. Currently unschemaed (intentional — the shape is settling). Re-author this file whenever an artifact is added, removed, or version-bumped.
- `schemas/` — generated JSON Schemas for Capability, Skill, Component, Manifest, Trigger, Intent, Audit, etc. Generated from `@cir/schemas` via `pnpm schemas:dump`. Re-run after any schema change. The golden test in `packages/schemas/test/golden.test.ts` guards against drift.

Shape:

```json
{
  "version": "0.1.0",
  "spec_url": "https://github.com/fragmatic-io/cir",
  "schemas_dir": "/.well-known/schemas/",
  "components_registry": "/components/registry.json",
  "capabilities": [{ "id": "...", "version": "...", "url": "..." }],
  "skills": [{ "name": "...", "version": "...", "url": "..." }],
  "policies": [{ "id": "...", "url": "..." }],
  "recipes": [{ "persona": "...", "url": "..." }],
  "signature": null
}
```

## Background

See [`../docs/architecture.md`](../docs/architecture.md) — section "Service contracts", which spells out the full `GET /.well-known/cir.json` contract and the downstream `/capabilities/{id}@{version}`, `/skills/{name}@{version}`, and `/components/registry@{version}` endpoints it advertises.

## Updating the discovery document

Per [`../AGENTS.md`](../AGENTS.md) "When asked to add a capability", **every new capability bumps the registry version and updates `cir.json`**. The discovery document is the contract a remote compiler relies on; if it lies, every cache downstream is poisoned.

Rules:

- The document is **signed** (per the security threat model in `../docs/production-concerns.md`). Re-sign on every change.
- Bump the top-level `version` on any structural change.
- URLs in the document are immutable once published; move artifacts behind a stable URL, do not relocate.

## Status

`schemas/` populated in **Phase 2** (12 generated JSON Schemas covering every CIR artifact type). `cir.json` itself lands when the first capability registry ships in **Phase 5**.
