# .well-known/

**Public discovery.** The single file `cir.json` advertises a CIR-compliant app's capability registry, skill library, and component catalog so any compatible compiler, agent, or runtime can find them. This is the entry point for the entire public surface.

## Files

- `cir.json` — the discovery document. Served at `https://{app-host}/.well-known/cir.json` in production.

Shape:

```json
{
  "version": "1.0.0",
  "capabilities_url": "https://app.example.com/capabilities",
  "skills_url": "https://app.example.com/skills",
  "components_url": "https://app.example.com/components",
  "signature": "..."
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

Empty in Phase 1; populated starting in **Phase 2 (schemas)** when the first capabilities land. The file itself can ship as soon as the registry has its first signed entry.
